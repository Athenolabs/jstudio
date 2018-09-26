#-*- coding: utf-8 -*-

import six
import json
import frappe
import frappe.model
from dukpy.evaljs import JSInterpreter
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
		self.evaljs('\n'.join(JS_GLOBALS))
		#frappe.msgprint('<pre>{}</pre>'.format('\n'.join(JS_GLOBALS)))

	def _call_python(self, func, json_args):
		func = func.decode('utf-8')
		json_args = json_args.decode('utf-8')

		args = json.loads(json_args)[0]
		ret = self._funcs[func](*args)
		if ret is not None:
			return json.dumps(ret).encode('utf-8')


def evaluate_js(js, context={}, kwargs={}):
	if isinstance(context, six.string_types):
		context = json.loads(context)
	if 'doc' in context:
		doc = context.pop('doc')
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
	jsi.evaljs(frappe.db.get_value('Action', action, 'code'))



@frappe.whitelist()
def get_field_options(doctype):
	return [None] + sorted([
		{'value': f.fieldname, 'label': frappe._(f.label)}
		for f in frappe.get_meta(doctype).fields
		if f.fieldtype not in frappe.model.no_value_fields
	], key=lambda f: f['label'])


def run_event(event, doc, handler=None):
	if not frappe.flags.on_import:
		if isinstance(doc, six.string_types):
			doc = json.loads(doc, object_pairs_hook=frappe._dict)
		event_name = " ".join(event.split("_")).title()
		for action in frappe.get_all('Action Trigger', fields=['*'], filters={
			'dt': doc.doctype,
			'event': event_name}):
			if not action.run_when or evaluate_js(action.run_when, {'doc': doc}):
				run_action(action, {'doc': doc, 'event': event_name})


def run_onload_event(doc, handler=None):
	run_event('onload', doc, handler=handler)

def run_autoname_event(doc, handler=None):
	run_event('autoname', doc, handler=handler)

def run_validate_event(doc, handler=None):
	run_event('validate', doc, handler=handler)

def run_before_save_event(doc, handler=None):
	run_event('before_save', doc, handler=handler)

def run_after_save_event(doc, handler=None):
	run_event('after_save', doc, handler=handler)

def run_before_insert_event(doc, handler=None):
	run_event('before_insert', doc, handler=handler)

def run_after_insert_event(doc, handler=None):
	run_event('after_insert', doc, handler=handler)

def run_before_submit_event(doc, handler=None):
	run_event('before_submit', doc, handler=handler)

def run_after_submit_event(doc, handler=None):
	run_event('after_submit', doc, handler=handler)

def run_on_update_event(doc, handler=None):
	run_event('on_update', doc, handler=handler)

def run_on_submit_event(doc, handler=None):
	run_event('on_submit', doc, handler=handler)

def run_on_cancel_event(doc, handler=None):
	run_event('on_cancel', doc, handler=handler)

def run_update_after_submit(doc, handler=None):
	run_event('on_update_after_submit', doc, handler=handler)

def run_on_change_event(doc, handler=None):
	run_event('on_change', doc, handler=handler)

def run_on_trash_event(doc, handler=None):
	run_event('on_trash', doc, handler=handler)

def run_on_after_delete_event(doc, handler=None):
	run_event('after_delete', doc, handler=handler)