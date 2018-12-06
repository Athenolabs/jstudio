#-*- coding: utf-8 -*-

import six
import frappe
import requests
import inspect
import datetime
import json
import cgi
import xmltodict
from frappe.utils import format_datetime

def run_sql(query, values=(), as_dict=0, as_list=0, formatted=0, as_utf8=0):
	query = query.strip()
	if not query or not query.lower().startswith('select'):
		frappe.msgprint(frappe._("Query must be a SELECT"))
		return
	elif query.split(';') > 1:
		frappe.msgprint(frappe._('Only one statement is allowed per SQL call'))
		return
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

def get_value(dt, kwargs):
	return frappe.db.get_value(dt, **kwargs)

def exists(dt, kwargs):
	return frappe.db.exists(dt, **kwargs)

def count(dt, kwargs):
	return frappe.db.count(dt, **kwargs)

def form_dict():
	return frappe.local.form_dict

def get_report_data(report_name, filters={}):
	from api import query_report_run
	data = query_report_run(report_name, filters)
	columns = map(frappe.scrub, [r.split(':')[0] for r in data['columns']])
	data = map(dict, [zip(columns, json.loads(frappe.as_json(row))) for row in data['result'] if not("'Total'" in data)])
	return data

def filter_dict(dicts, filters):
	ret = []
	if isinstance(filters, six.string_types):
		return [dict.get(filters)]
	for item in dicts:
		append = False
		for k, v in filters.items():
			if isinstance(v, list):
				if (k not in item):
					continue
				elif v[0] == 'in' and v[1] not in item.get(k, []):
					continue
				elif v[0] == 'not in' and v[1] in item.get(k, []):
					continue
				elif v[0] == '<' and v[1] >= item.get(k, 0.0):
					continue
				elif v[0] == '>' and v[1] <= item.get(k, 0.0):
					continue
				elif v[0] == '>=' and v[1] < item.get(k, 0.0):
					continue
				elif v[0] == '<=' and v[1] > item.get(k, 0.0):
					continue
				elif v[0] in ('!=', '<>', '!==') and v[0] == item.get(k):
					continue
				elif v[0] in ('=', '==', '===') and v[0] != item.get(k):
					continue
				elif v[0] == 'between' and (v[1] < item.get(k) or v[2] > item.get(k)):
					continue
			elif (k not in item or v != item[k]):
				continue
			append = True
		if append:
			ret.append(item)
	return ret		

def web(method, url, kwargs={}):
	res = {}
	escape = kwargs.pop('escape', False)
	as_json = kwargs.pop('as_json', False)
	if hasattr(requests, method):
		res.update(vars(getattr(requests, method)(url, **kwargs)))
		for k, v in res.items():
			if k == '_content':
				try:
					res[k] = json.loads(res[k])
				except ValueError:
					try:
						if as_json:
							res[k] = xmltodict.parse(res[k])
						elif escape:
							res[k] = cgi.escape(res[k])
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

def xml_to_dict(xml, kwargs={}):
	return xmltodict.parse(xml, **kwargs)

def dict_to_xml(obj, kwargs={}):
	return xmltodict.unparse(obj, **kwargs)