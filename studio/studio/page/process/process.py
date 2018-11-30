# -*- coding: utf-8 -*-

from __future__ import unicode_literals, division, absolute_import, print_function

import frappe

@frappe.whitelist()
def get_process_info(process=None):
	ret = {
		'process_list': [],
		'process': None,
		'requests': []
	}

	if not process:
		ret['process_list'] = frappe.get_all('Process', fields='*', filters={'disabled': False})
	else:
		ret['process'] = frappe.get_doc('Process', process).as_dict()
		ret['requests'].extend([
			frappe.get_doc('Process Request', req.name).to_view()
			for req in frappe.get_all('Process Request', filters={'process_id': process})
		])

	return ret