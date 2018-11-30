# -*- coding: utf-8 -*-
# Copyright (c) 2018, Maxwell Morais and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class Process(Document):
	def validate(self):
		invalid_start_activities = []
		invalid_target_activities = []
		validated_activities = set()
		all_activities = set([activity.activity_name for activity in self.activities])
		
		for flow in self.flow:
			if not self.get('activities', {'activity_name': flow.activity_name}):
				invalid_start_activities.append(u'{0} - {1}'.format(flow.idx, flow.activity_name))
			else:
				validated_activities.add(flow.activity_name)
			if flow.next_activity and not self.get('activities', {'activity_name': flow.next_activity}):
				invalid_target_activities.append(u'{0} - {1}'.format(flow.idx, flow.next_activity))
			elif flow.next_activity:
				validated_activities.add(flow.next_activity)

		if invalid_start_activities:
			msg = u'<br>'.join(invalid_start_activities)
			frappe.throw(frappe._(u'The following start activities are invalid: {0}').format('<br>'+msg))
		
		if invalid_target_activities:
			msg = u'<br>'.join(invalid_target_activities)
			frappe.throw(frappe._(u'The following target activities are invalid: {0}').format('<br>' + msg))

		untargeted = all_activities - validated_activities
		if untargeted:
			key = u'<br>&nbsp;&nbsp;-&nbsp;'
			msg = key
			for i, untarget in enumerate(untargeted, 1):
				msg += untarget
				if i < len(untargeted):
					msg += key
			frappe.msgprint(frappe._(u"The following activities are unreacheable:").format(key))

	def before_save(self):
		self.title = u" ".join([self.name, self.process_name.lower().title()])

	def get_requests(self):
		""" Return all requests for the active process """
		return frappe.get_all('Process Request', fields='*', filters={
			'process': self.name
		})

	def get_initial_activity_name(self):
		return self.flow[0].activity_name


@frappe.whitelist()
def initiate_request(process, subject):
	doc = frappe.get_doc('Process', process)
	activity = doc.get_initial_activity_name()

	request = frappe.new_doc('Process Request').update({
		'owner': frappe.session.user,
		'process_id': process,
		'status': 'Initiated',
		'subject': subject
	}).insert()

	task = frappe.new_doc('Process Task').update({
		'request': request.name,
		'activity': activity,
		'assignee': doc.get('activities', {
			'activity_name': activity
		})[0].team,
		'status': 'Not Started'
	}).insert()