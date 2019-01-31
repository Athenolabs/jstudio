# -*- coding: utf-8 -*-
from __future__ import unicode_literals

__version__ = '0.0.1'

import frappe
import json
import frappe.api
from frappe import _
from frappe.utils import response
from frappe.model.document import Document
from frappe import _
from frappe.utils import cint, cstr
from frappe.desk import query_report

def document_hook(f):
	"""Decorator: Make method `hookable` (i.e. extensible by another app).
	Note: If each hooked method returns a value (dict), then all returns are
	collated in one dict and returned. Ideally, don't return values in hookable
	methods, set properties in the document."""
	def add_to_return_value(self, new_return_value):
		if isinstance(new_return_value, dict):
			if not self.get("_return_value"):
				self._return_value = {}
			self._return_value.update(new_return_value)
		else:
			self._return_value = new_return_value or self.get("_return_value")

	def compose(fn, *hooks):
		def runner(self, method, *args, **kwargs):
			add_to_return_value(self, fn(self, *args, **kwargs))
			for f in hooks:
				add_to_return_value(self, f(self, method, *args, **kwargs))

			return self._return_value

		return runner

	def composer(self, *args, **kwargs):
		hooks = []
		method = f.__name__
		doc_events = frappe.get_doc_hooks()

		for handler in doc_events.get(self.doctype, {}).get(method, []) \
			+ doc_events.get("*", {}).get(method, []) \
			+ doc_events.get("*", {}).get("*", []):
			hooks.append(frappe.get_attr(handler))

		composed = compose(f, *hooks)
		return composed(self, method, *args, **kwargs)

	return composer

def handle_action(action):
	"""handle action"""

	from api import run_action

	if not frappe.db.exists('Action', action):
		raise frappe.DoesNotExistError
	elif not cint(frappe.db.get_value('Action', action, 'allow_external_access')):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	else:
		try:
			_d, data = run_action(action, kwargs=frappe.local.form_dict)
			if data:
				if 'response' not in data:
					frappe.local.response['message'] = data
					return frappe.api.build_response('json')
				else:
					data = data['response']
					ret = response.Response()
					if 'http_status_code' in data:
						response.status_code = data['http_status_code']
					
					ret.mimetype = "application/json"
					ret.charset = 'utf-8'
					ret.data = json.dumps(data['content'], 
						default=response.json_handler, separators=(',', ':'))
					return ret
					
		except Exception as e:
			if frappe.local.conf.developer_mode:
				raise e
			else:
				frappe.respond_as_web_page(title="Invalid action", html="Action not found",
					indicator_color='red', http_status_code=404)
	

def handle():
	"""
	Handler for `/api` methods
	### Examples:
	`/api/method/{methodname}` will call a whitelisted method
	`/api/action/{actioname}` will call a available action
	`/api/resource/{doctype}` will query a table
		examples:
		- `?fields=["name", "owner"]`
		- `?filters=[["Task", "name", "like", "%005"]]`
		- `?limit_start=0`
		- `?limit_page_length=20`
	`/api/resource/{doctype}/{name}` will point to a resource
		`GET` will return doclist
		`POST` will insert
		`PUT` will update
		`DELETE` will delete
	`/api/resource/{doctype}/{name}?run_method={method}` will run a whitelisted controller method
	"""

	frappe.api.validate_oauth()
	frappe.api.validate_auth_via_api_keys()

	parts = frappe.request.path[1:].split("/",3)
	call = doctype = name = None

	if len(parts) > 1:
		call = parts[1]

	if len(parts) > 2:
		doctype = parts[2]

	if len(parts) > 3:
		name = parts[3]

	if call=="method":
		frappe.local.form_dict.cmd = doctype
		return frappe.handler.handle()

	elif call=="resource":
		if "run_method" in frappe.local.form_dict:
			method = frappe.local.form_dict.pop("run_method")
			doc = frappe.get_doc(doctype, name)
			doc.is_whitelisted(method)

			if frappe.local.request.method=="GET":
				if not doc.has_permission("read"):
					frappe.throw(_("Not permitted"), frappe.PermissionError)
				frappe.local.response.update({"data": doc.run_method(method, **frappe.local.form_dict)})

			if frappe.local.request.method=="POST":
				if not doc.has_permission("write"):
					frappe.throw(_("Not permitted"), frappe.PermissionError)

				frappe.local.response.update({"data": doc.run_method(method, **frappe.local.form_dict)})
				frappe.db.commit()

		else:
			if name:
				if frappe.local.request.method=="GET":
					doc = frappe.get_doc(doctype, name)
					if not doc.has_permission("read"):
						raise frappe.PermissionError
					frappe.local.response.update({"data": doc})

				if frappe.local.request.method=="PUT":
					data = json.loads(frappe.local.form_dict.data)
					doc = frappe.get_doc(doctype, name)

					if "flags" in data:
						del data["flags"]

					# Not checking permissions here because it's checked in doc.save
					doc.update(data)

					frappe.local.response.update({
						"data": doc.save().as_dict()
					})
					frappe.db.commit()

				if frappe.local.request.method=="DELETE":
					# Not checking permissions here because it's checked in delete_doc
					frappe.delete_doc(doctype, name, ignore_missing=False)
					frappe.local.response.http_status_code = 202
					frappe.local.response.message = "ok"
					frappe.db.commit()


			elif doctype:
				if frappe.local.request.method=="GET":
					if frappe.local.form_dict.get('fields'):
						frappe.local.form_dict['fields'] = json.loads(frappe.local.form_dict['fields'])
					frappe.local.form_dict.setdefault('limit_page_length', 20)
					frappe.local.response.update({
						"data":  frappe.call(frappe.client.get_list,
							doctype, **frappe.local.form_dict)})

				if frappe.local.request.method=="POST":
					data = json.loads(frappe.local.form_dict.data)
					data.update({
						"doctype": doctype
					})
					frappe.local.response.update({
						"data": frappe.get_doc(data).insert().as_dict()
					})
					frappe.db.commit()
			else:
				raise frappe.DoesNotExistError
	elif call == "action":
		return handle_action(doctype)
	else:
		raise frappe.DoesNotExistError

	return frappe.api.build_response("json")

def generate_report_result(report, filters=None, user=None):
	status = None
	if not user:
		user = frappe.session.user
	if not filters:
		filters = []

	if filters and isinstance(filters, query_report.string_types):
		filters = json.loads(filters)
	columns, result, message, chart, data_to_be_printed = [], [], None, None, None
	if report.report_type == "Query Report":
		if not report.query:
			status = "error"
			frappe.msgprint(_("Must specify a Query to run"), raise_exception=True)

		if not report.query.lower().startswith("select"):
			status = "error"
			frappe.msgprint(_("Query must be a SELECT"), raise_exception=True)

		result = [list(t) for t in frappe.db.sql(report.query, filters)]
		columns = [cstr(c[0]) for c in frappe.db.get_description()]
	else:
		module = report.module or frappe.db.get_value("DocType", report.ref_doctype, "module")
		if report.is_standard == "Yes":
			method_name = query_report.get_report_module_dotted_path(module, report.name) + ".execute"
			res = []

			# The JOB
			res = frappe.get_attr(method_name)(frappe._dict(filters))

			columns, result = res[0], res[1]
			if len(res) > 2:
				message = res[2]
			if len(res) > 3:
				chart = res[3]
			if len(res) > 4:
				data_to_be_printed = res[4]

	if result:
		result = query_report.get_filtered_data(report.ref_doctype, columns, result, user)

	if cint(report.add_total_row) and result:
		result = query_report.add_total_row(result, columns)

	return {
		"result": result,
		"columns": columns,
		"message": message,
		"chart": chart,
		"data_to_be_printed": data_to_be_printed,
		"status": status
	}



Document.hook = staticmethod(document_hook)
frappe.api.handle = handle
query_report.generate_report_result = generate_report_result