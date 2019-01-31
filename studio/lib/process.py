# -*- coding: utf-8 -*-

from __future__ import unicode_literals, division, absolute_import, print_function


class Task(object):
	def __init__(self, task_type):
		self.id = None
		self.name = None
		self.incoming_flows = []
		self.outgoing_flows = []

	def as_dict(self):
		def handle_flow(flow):
			return {
				'from': flow['from']['id'],
				'to': flow['to']['id'],
				'condition': flow.get('condition')
			}

		return {
			'id': self.id,
			'name': self.name,
			'type': self.type,
			'incoming_flows': map(lambda flow: handle_flow(flow), self.incoming_flows),
			'outgoing_flows': map(lambda flow: handle_flow(flow), self.outgoing_flows)
		}

	def from_dict(self, entity):
		self.id = entity['id']
		self.name = entity['name']
		self.type = entity['type']



class ProcessBuilder(object):
	@staticmethod
	def start_task():
		return Task('start-task')

	@staticmethod
	def end_task():
		return Task('end-task')

	def register_task(self, task_type, task_class):
		_type = ''.join(x for x in task_type.title() if not x.isspace())
		
		self.__dict__[_type] = lambda *args, **kwargs: task_class(*args, **kwargs)

	def create_task(self, task_type, *args, **kwargs):
		_type = ''.join(x for x in task_type.title() if not x.isspace())

		if _type in self.__dict__:
			return self.__dict__[_type](*args, **kwargs)



class ProcessDefinition(object):
	def __init__(self, name, engine):
		self.engine = engine
		self.name = name
		self.tasks = {}
		self.next_task_id = 0
		self.layout = None
		self.id = None
		self.variables = {}
		self.category = "Default"

	def add_task(self, task):
		_id = getattr(task, 'id', None)
		if _id:
			self.next_task_id += 1
			_id = self.next_task_id
		
		self.tasks[_id] = task

	def add_flow(self, task_from, task_to, condition=None):
		flow = {
			'from': task_from,
			'to': task_to,
			'condition': condition
		}
		task_to.incoming_flows.append(flow)
		task_from.outgoing_flows.append(flow)

	def as_dict(self):
		tasks = map(lambda t: t.as_dict(), self.tasks)

		return {
			'id': self.id,
			'name': self.name,
			'tasks': tasks,
			'variables': self.variables,
			'category': self.category
		}

	def from_dict(self, engine, entity):
		pdef = ProcessDefinition(entity.get('name'), engine)
		pdef.id = entity['id']
		pdef.variables = entity.get('variables', {})
		pdef.category = entity.get('category', 'Default')

		def deserialize_flow(flow):
			return {
				'deserialize_flow': {
					'from': pdef.tasks[flow['from']],
					'to': pdef.tasks[flow['to']],
					'condition': flow['condition']
				}
			}

		for task_entity in entity.get('tasks', []):
			pdef.tasks[task_entity['id']].incoming_flows = map(
				deserialize_flow,
				task_entity['incoming_flows'])
			
			pdef.tasks[task_entity['id']].outgoing_flows = map(
				deserialize_flow,
				task_entity['outgoing_flows']
			)

		return pdef

process_builder = ProcessBuilder()