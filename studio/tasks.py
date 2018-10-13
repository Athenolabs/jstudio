# -*- coding: utf-8 -*-

from __future__ import unicode_literals, division, absolute_import, print_function

import frappe
from frappe.utils.error import create_error_snapshot
from frappe.utils.background_jobs import enqueue
from .api import evaluate_js, run_action

def _get_schedule_action_list(filters={}):
	filters['disabled'] = 0
	return frappe.get_all('Action', fields=['name', 'execute_when'])

def _execute_action(action, queue='default'):
	enqueue(
		run_action,
		queue=queue,
		job_name="Action: {}".format(action.name),
		kwargs={
			'action': action.name
		}
	)
	
def _execute_actions(action_list, queue='default'):
	for action in action_list:
		try:
			if not action.execute_when or bool(evaluate_js(action.execute_when)):
				_execute_action(action, queue)
		except Exception as e:
			create_error_snapshot(e)

def all():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Minute'
	}), 'short')

def hourly():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Hour',
		'is_long_job': 0
	}))

def hourly_long():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Hour',
		'is_long_job': 1
	}), 'long')

def midnight():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Midnight'
	}), 'long')

def daily():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Day',
		'is_long_job': 0
	}))

def daily_long():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Day',
		'is_long_job': 1
	}), 'long')

def weekly():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Week',
		'is_long_job': 0
	}))

def weekly_long():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Week',
		'is_long_job': 1
	}), 'long')

def monthly():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Month',
		'is_long_job': 0
	}))

def monthly_long():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Month',
		'is_long_job': 1
	}), 'long')

def yearly():
	_execute_actions(_get_schedule_action_list({
		'execute_every': 'Year',
	}), 'long')
