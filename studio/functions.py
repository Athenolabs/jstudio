#-*- coding: utf-8 -*-

import frappe
import requests
import inspect
import datetime
import json
from frappe.utils import format_datetime

def run_sql(query, values=(), as_dict=0, as_list=0, formatted=0, as_utf8=0):
	if not query or not query.lower().startswith('select'):
		frappe.msgprint(_("Query must be a SELECT"), raise_exception=True)
	return frappe.db.sql(
		query=query,
		values=values,
		as_dict=as_dict,
		as_list=as_list,
		formatted=formatted,
		as_utf8=as_utf8,
		auto_commit=0,
	)

def user():
	return getattr(frappe.local, "session", None) and frappe.local.session.user or "Guest"

def get_value(*args, **kwargs):
	return frappe.db.get_value(*args, **kwargs)

def exists(*args, **kwargs):
	return frappe.db.exists(*args, **kwargs)

def count(*args, **kwargs):
	return frappe.db.count(*args, **kwargs)

def form_dict():
	return frappe.local.form_dict

def web(method, url, kwargs={}):
	res = {}
	if hasattr(requests, method):
		res.update(vars(getattr(requests, method)(url, **kwargs)))
		for k, v in res.items():
			if k == '_content':
				try:
					res[k] = json.loads(res[k])
				except ValueError:
					pass
			elif k == 'headers':
				res[k] = dict(res[k])
			elif hasattr(v, 'get_dict'): #Cookies
				res[k] = res[k].get_dict()
				for sk, sv in res[k].items():
					if hasattr(sv, 'strftime'):
						res[k][sk] = format_datetime(sv)
					elif isinstance(sv, datetime.timedelta):
						res[k][sk] = {
							'days': sv.days,
							'seconds': sv.seconds,
							'microseconds': sv.microseconds
						}
			elif hasattr(v, 'strftime'): # Date and Datetimes
				res[k] = format_datetime(v)
			elif isinstance(v, datetime.timedelta):
				res[k] = {
					'days': v.days,
					'seconds': v.seconds,
					'microseconds': v.microseconds
				}
			elif callable(v):
				res[k] = res[k]()
			elif inspect.isclass(v) or k in ('raw','request', 'connection'):
				res.pop(k)
	return json.loads(frappe.as_json(res))
	
def get_doc(*args, **kwargs):
	return json.loads(frappe.get_doc(*args, **kwargs).as_json())

def call(method, arguments):
	return json.loads(frappe.as_json(frappe.call(method, arguments)))