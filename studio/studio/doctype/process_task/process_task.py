# -*- coding: utf-8 -*-
# Copyright (c) 2018, Maxwell Morais and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
import json
from frappe.model.document import Document

class ProcessTask(Document):
	def before_insert(self):
		self.idx = frappe.db.count('Process Task', {'request': self.request}) + 1

	def get_process(self):
		if not self.get('_process'): 
			process_name = frappe.db.get_value('Process Request', self.request, 'process_id')
			self._process = frappe.get_doc('Process', process_name)
		return self._process

	def get_request(self):
		if not self.get('_request'):
			self._request = frappe.get_doc('Process Request', self.request)
		return self._request
	
	def get_form(self):
		process_name = frappe.db.get_value('Process Request', self.request, 'process_id')
		form_name = frappe.get_value('Process Activity', {'parent': process_name, 'activity_name': self.activity}, 'form')
		return frappe.get_doc('Process Form', form_name)

	@property
	def activity_data(self):
		"""Return the activities associated with the task"""
		if self.data:
			return json.loads(self.data, object_pairs_hook=frappe._dict)
		return {}

	@property
	def is_active(self):
		"""Checks if the current task is active or is the most recent"""

		return self.idx == frappe.db.count('Process Task', {'request': self.request})

	@property
	def is_initial(self):
		"""Checks if the current task is final / start task"""
		return self.get_process().get('flow', {'activity_name': self.activity})[0].idx == 1

	@property
	def is_final(self):
		"""Check if the current task is final / end task"""
		return not bool(self.get_process().get('flow', {'activity_name': self.activity}))
	
	def get_previous(self):
		""" Returns previous task """
		if self.idx != 1:
			return frappe.get_doc('Process Task', {
				'request': self.request, 
				'idx': self.idx - 1
			})

	@property
	def can_view_activity(self):
		"""Checks if activity can be viewed"""
		return bool(self.activity_data)

	@property
	def can_initiate_activity(self):
		"""Checks if new activity can be initiated"""
		return not bool(self.activity_data)

	@property
	def can_revise_activity(self):
		"""Checks if activity can be revised"""
		return all([self.activity_data, self.is_active])

	@property
	def can_rollback(self):
		"""Checks if activity can be rolled back"""
		return not any([
			self.is_initial,
			self.status == "Completed"
		])

	def initiate(self):
		"""Initialize the task"""
		self.status == "In Progress"
		self.save()

	def submit(self, process, user, next_activity=None):
		"""Submits the task"""
		
		process = self.get_process()
		transitions = self.get('transitions', {'activity_name': self.activity})

		if not transitions:
			new_task = frappe.new_doc('Process Task').update({
				'request': self.request,
				'assignee': process.get(next_activity)[0].team,
				'activity': next_activity,
				'status': 'Not Started'
			})
			new_task.flags.ignore_permissions = True
			new_task.insert()
		else:
			self.get_request().db_set('status', 'Completed', ignore_permissions=True)

	def rollback(self):
		""" Rollback to the previous task """

		previous = self.previous
		previous.db_set('status', 'Rolled Back', ignore_permissions=True)
		
		self.db_set('status', 'Rolled Back')

		clone = frappe.new_doc('Process Task').update(self.previous.as_dict()).update({
			'name': None, 'status': 'Not Started'
		})
		clone.flags.ignore_permissions = True
		clone.insert()

	def to_view(self):
		base = self.as_dict()

		for prop in ('activity_data', 'is_active', 'is_initial', 'is_final', 
					'can_view_activity', 'can_initiate_activity', 'can_revise_activity', 'can_rollback'):
			base[prop] = getattr(self, prop)
		
		base['form'] = self.get_form().as_dict()
		base['form']['layout'] = [{}]

		return base