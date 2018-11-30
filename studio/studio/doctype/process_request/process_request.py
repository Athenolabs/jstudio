# -*- coding: utf-8 -*-
# Copyright (c) 2018, Maxwell Morais and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class ProcessRequest(Document):
	@property
	def tasks(self):
		if not self.get('_tasks'):
			self._tasks = []
			for task in frappe.get_all('Process Task', filters={'request': self.name}):
				self._tasks.append(frappe.get_doc('Process Task', task.name))
		return self._tasks

	def to_view(self):
		base = self.as_dict()
		base['tasks'] = [task.to_view() for task in self.tasks]
		return base