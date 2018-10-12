#-*- coding: utf-8 -*-

import six
import json
import frappe
import datetime
import frappe.model
from frappe.utils import cstr, cint
from dukpy.evaljs import JSInterpreter
from dukpy._dukpy import JSRuntimeError
from collections import defaultdict

tree = lambda : defaultdict(tree)

def get_attr(attr):
	try:
		return frappe.get_attr(attr)
	except (AttributeError, frappe.AppNotInstalledError, frappe.ValidationError):
		frappe.clear_messages()
		return frappe.get_module(attr)


class JSInterpreter(JSInterpreter):
	""" A DukPy Interpreter that provides an extensible layer with Frappe"""
	def __init__(self):
		super(JSInterpreter, self).__init__()
		
		# load javascript path
		for app in frappe.get_installed_apps():
			for hook in frappe.get_hooks('studio_library_path', app_name=app):
				self.loader.register_path(frappe.get_app_path(app, hook))

		# load functions
		_gbl = tree()
		replacements = {}
		for attr in frappe.get_hooks('studio_functions', []):
			if isinstance(attr, dict):
				for key, value in attr.items():
					path = key
					self.export_function(key, get_attr(value))
			elif isinstance(attr, (list, tuple, set)):
				raise frappe.ValidationError('Invalid hook format {}, should be ("list" or "dict") not "{}"'.format(
					frappe.as_json(list(attr)), type(attr).__name__
				))
			else:
				path = attr
				self.export_function(attr, get_attr(attr))
			
			self.evaljs('''function as_list(a){ var args = []; for(var i = 0; i < a.length; i++){ args.push(a[i]); } return args; }''')

			parts = path.split('.')
			fn = parts.pop()
			actual = None
			for part in parts:
				actual = (actual or _gbl)[part]
			actual[fn] = '{{{0}}}'.format(path.replace('.', '_'))
			replacements[path.replace('.', '_')] = '''function() {{ return call_python("{0}", as_list(arguments)); }}'''.format(path)

		JS_GLOBALS = []
		
		for k in _gbl.keys():
			JS_GLOBALS_PART = k + ' = ' + json.dumps(_gbl[k], indent=2) + ';'
				
			for rk, v in replacements.items():
				if not rk.startswith(k + '_'):
					continue
				JS_GLOBALS_PART = JS_GLOBALS_PART.replace('"{' + rk + '}"', v)
		JS_GLOBALS.append(JS_GLOBALS_PART)
		#frappe.msgprint('<pre>{0}</pre>'.format('\n'.join(JS_GLOBALS)))
		self.evaljs('\n'.join(JS_GLOBALS))

	def _call_python(self, func, json_args):
		func = func.decode('utf-8')
		json_args = json_args.decode('utf-8')

		args = json.loads(json_args)[0]
		ret = self._funcs[func](*args)
		if ret is not None:
			return json.dumps(ret).encode('utf-8')


def evaluate_js(js, context={}, kwargs={}, default_context=True, context_processor=None):
	if isinstance(context, six.string_types):
		context = json.loads(context)
	if 'doc' in context:
		doc = context.pop('doc')
	else:
		doc = {}
	if isinstance(kwargs, six.string_types):
		kwargs = json.loads(kwargs)

	jsi = JSInterpreter()

	if default_context:
		# build the standard context if none provided
	
		jsi.evaljs("""
		ctx = dukpy.context;
		kwargs = dukpy.kwargs;
		doc = dukpy.doc;
		delete dukpy;
		""", context=context, kwargs=kwargs, doc=doc)
	
	if callable(context_processor):
		context_processor(jsi)
	
	return jsi.evaljs(js)


@frappe.whitelist()
def run_action(action, context={}, kwargs={}):
	if isinstance(context, six.string_types):
		context = json.loads(context)
	if 'doc' in context:
		doc = context.pop('doc')
		if hasattr(doc, 'as_json'):
			doc = json.loads(doc.as_json())
	else:
		doc = {}
	if isinstance(kwargs, six.string_types):
		kwargs = json.loads(kwargs)

	jsi = JSInterpreter()
	
	jsi.evaljs("""
	ctx = dukpy.context;
	kwargs = dukpy.kwargs;
	doc = dukpy.doc;
	delete dukpy;
	""", context=context, kwargs=kwargs, doc=doc)

	ret = jsi.evaljs(frappe.db.get_value('Action', action, 'code'))
	new_ctx, new_doc = jsi.evaljs('[ctx, doc];')
	return new_doc, ret


@frappe.whitelist()
@frappe.read_only()
def query_report_run(report_name, filters=None, user=None):
	from frappe.desk.query_report import (
		get_report_doc,
		get_prepared_report_result,
		generate_report_result,
		get_filtered_data,
		add_total_row
	)

	report = get_report_doc(report_name)
	if not user:
		user = frappe.session.user
	if not frappe.has_permission(report.ref_doctype, "report"):
		frappe.msgprint(frappe._("Must have report permission to access this report.",
								 raise_exception=True))

	result = None
	if report.prepared_report:
		if filters:
			if isinstance(filters, six.string_types):
				filters = json.loads(filters)
			
			dn = filters.get('prepared_report_name')
		else:
			dn = ''
		result = get_prepared_report_result(report, filters, dn)
	elif report.backend_js:
		threshold = 10
		res = []
		start_time = datetime.datetime.now()
		# The JOB
		def context_processor(jsi):
			jsi.evaljs('''
			var columns = [],
			    data = [],
				message = null,
				chart = [],
				data_to_be_printed = [];
			''')	
		
		res = evaluate_js(
			report.backend_js + '\n;[columns,data,message,chart,data_to_be_printed]', 
			default_context=False, 
			context_processor=context_processor)
		frappe.msgprint('<pre>{0}</pre>'.format(frappe.as_json(res)))
		end_time = datetime.datetime.now()
		if (end_time - start_time).seconds > threshold and not report.prepared_report:
			report.db_set('prepared_report', 1)

		message, chart, data_to_be_printed = None, None, None
		columns, result = res[0], res[1]
		if len(res) > 2:
			message = res[2]
		if len(res) > 3:
			chart = res[3]
		if len(res) > 4:
			data_to_be_printed = res[4]

		if result:
			result = get_filtered_data(report.ref_doctype, columns, result, user)
		
		if cint(report.add_total_row) and result:
			result = add_total_row(result, columns)

		result = {
			'result': result,
			'columns': columns,
			'message': message,
			'chart': chart,
			'data_to_be_printed': data_to_be_printed,
			'status': None
		}
		

	else:
		result = generate_report_result(report, filters, user)

	return result


@frappe.whitelist()
def get_field_options(doctype):
	return [None] + sorted([
		{'value': f.fieldname, 'label': frappe._(f.label)}
		for f in frappe.get_meta(doctype).fields
		if f.fieldtype not in frappe.model.no_value_fields
	], key=lambda f: f['label'])


def run_event(doc, event):
	"""Method handler for any event"""
	if not (frappe.flags.on_import or getattr(getattr(doc, 'flags', frappe._dict()), 'ignore_{}'.format(event), False)):
		if isinstance(doc, six.string_types):
			doc = json.loads(doc, object_pairs_hook=frappe._dict)
		event_name = " ".join(event.split("_")).title()
		for action in frappe.get_all('Action Trigger', fields=['*'], filters={
			'dt': doc.doctype,
			'event': event_name}):
			if not action.run_when or evaluate_js(action.run_when, {'doc': doc}):
				run_action(action, {'doc': doc, 'event': event_name})


@frappe.whitelist()
def get_action_list(dt):
	actions = frappe.get_all(
		"Action Form Binding", 
		fields=["parent", "menu_label", "menu_group", "depends_on"],
		filters={
			'dt': dt
		},
		order_by='idx ASC',
		limit_page_length=20
	)

	for action in actions:
		action['arguments'] = frappe.get_all(
			'Action Argument',
			fields=['label', 'argtype', 'argname', 'required', 'collapsible', 
					'collapsible_when', 'options', 'default', 'depends_on'],
			filters={
				'dt': dt
			},
			order_by='idx ASc'
		)
		action['mappings'] = frappe.get_all(
			'Action Mapping',
			fields=['field', 'value_processor'],
			filters={
				'dt': dt
			},
			order_by='idx ASC'
		)
	return actions