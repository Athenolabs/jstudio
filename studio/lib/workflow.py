# -*- coding: utf-8 -*-

from __future__ import unicode_literals, division, absolute_import, print_function

from six import string_types
from collections import Iterable
from frappe import _dict
from studio.api import evaluate_js
from collections import OrderedDict

class TransitionNotDefined(ValueError):
	pass

class TransitionNotPermitted(Exception):
	pass

def get_js_evaluator(js):
	def wrapped(subject, context, workflow, **kwargs):
		kwargs.update({
		#	'workflow': workflow.as_dict()
		})
		return evaluate_js(js, context, kwargs)
	return wrapped

class State(object):
	def __init__(self, name, on_enter=None, on_leave=None):
		self.__name = name
		self.__original_on_enter = None
		self.__original_on_leave = None
		if not on_enter:
			on_enter = 'true;'
		self.on_enter = on_enter
		
		if not on_leave:
			on_leave = 'true;'
		self.on_leave = on_leave

	@property
	def name(self):
		return self.__name

	@property
	def on_enter(self):
		return self.__on_enter

	@on_enter.setter
	def on_enter(self, value):
		self.__original_on_enter = value
		if isinstance(value, string_types):
			self.__on_enter = get_js_evaluator(value)
		elif callable(value):
			self.__on_enter = value

	@property
	def on_leave(self):
		return self.__on_leave
	
	@on_leave.setter
	def on_leave(self, value):
		self.__original_on_leave = value
		if isinstance(value, string_types):
			self.__on_enter = get_js_evaluator(value)
		elif callable(value):
			self.__on_enter = value

	def __str__(self):
		return type('')(self.__name.encode('utf-8'))

	def __unicode__(self):
		return type(u'')(self.__name.decode('utf-8'))

	def __repr__(self):
		return '<State: {}>'.format(str(self))

	def as_dict(self):
		ret = {
			'state': self.name
		}
		if self.__original_on_enter \
			and not callable(self.__original_on_enter):
			ret['on_enter'] = self.__on_enter

		if self.__original_on_leave \
			and not callable(self.__original_on_leave):
			ret['on_enter'] = self.__original_on_leave

		return ret


class Transition(object):
	def __init__(self, action, source, target, guard=None, on_transition=None):
		self.__name = action
		self.__source = source
		self.__target = target
		self.__original_guard = None
		self.__original_on_transition = None

		if not on_transition:
			on_transition = 'true;'
		self.on_transition = on_transition

		if not guard:
			guard = 'true;'
		self.__original_guard = guard
		self.guard = guard

	@property
	def name(self):
		return self.__name

	@property
	def source(self):
		return self.__source

	@property
	def target(self):
		return self.__target

	@property
	def on_transition(self):
		return self.__on_transition
	
	@on_transition.setter
	def on_transition(self, value):
		self.__original_on_transition = value
		if isinstance(value, string_types):
			self.__on_enter = get_js_evaluator(value)
		else:
			self.__on_enter = value
	
	@property
	def guard(self):
		return self.__guard
	
	@guard.setter
	def guard(self, value):
		self.__original_guard = value
		if isinstance(value, string_types):
			self.__guard = get_js_evaluator(value)
		elif callable(value):
			self.__guard = guard
		

	def __str__(self):
		return type('')(self.__name.encode('utf-8'))
	
	def __unicode__(self):
		return type(u'')(self.__name.decode('utf-8'))

	def __repr__(self):
		return '<Transition: {} ({} -> {})>'.format(
			self.name,
			self.__source.name,
			self.__target.name
		)

	def as_dict(self):
		ret = {
			'transition': self.name,
			'source': self.source.name,
			'target': self.target.name
		}
		if self.__original_guard \
			and isinstance(self.__original_guard, string_types):
			ret['guard'] = self.__original_guard
		
		if self.__original_on_transition \
			and isinstance(self.__original_guard, string_types):
			ret['on_transition'] = self.__original_on_transition

		return ret


class WorkflowDefinition(object):
	def __init__(self, states, transitions, initial_state=None):
		self.__states = OrderedDict()
		self.__transitions = []
		self.__initial_state = None

		for state in states:
			self.add_state(state)
		
		for transition in transitions:
			self.add_transition(transition)

		if initial_state:
			self.__initial_state = initial_state

	@property
	def states(self):
		return self.__states

	@property
	def transitions(self):
		return self.__transitions

	@property
	def initial_state(self):
		return self.__initial_state

	@initial_state.setter
	def initial_state(self, state):
		is_state_set = False
		if isinstance(state, string_types):
			if state in self.__states:
				self.__initial_state = state
				is_state_set = True
		elif isinstance(state, State):
			if str(state) in self.__states:
				self.__initial_state = state
				is_state_set = True
		
		if not is_state_set:
			raise ValueError('Initial state {0} is not defined in states'.format(state))
	
	def add_state(self, state):
		
		if isinstance(state, string_types):
			state = State(state)
		elif isinstance(state, dict):
			state = State(**state)
		
		if str(state) in self.__states:
			raise ValueError('Duplicate state declaration "{}"'.format(str(state)))
		
		if not self.__states:
			self.__initial_state = str(state)

		self.__states[str(state)] = state

	def add_transition(self, transition):
		if isinstance(transition, dict):
			transition = Transition(**transition)
		elif not isinstance(transition, Transition):
			raise ValueError('Cannot build transition from "{}"'.format(
				type(transition).__name__))
		
		self.__transitions.append(transition)

	def as_dict(self):
		return {
			'states': [
				state.as_dict() for state in self.__states.values()
			],
			'transitions': [
				transition.as_dict() for transition in self.__transitions
			],
			'graphviz': dump_dot(self)
		}


class WorkFlow(object):
	def __init__(self, definition, context=None):
		self.__definition = definition
		self.__context = context or {}
		
	@property
	def context(self):
		return self.__context

	def get_state(self, subject):
		if 'state' not in subject:
			subject['state'] = None
		return subject['state']

	@staticmethod
	def clear(subject):
		WorkFlow.get_state(subject).clear()

	def start(self, subject):
		state = self.get_state(subject)
		if not state:
			inittial_state = self.__definition.initial_state
			subject['state'] = inittial_state
			state_obj = self.__definition.states.get(inittial_state)
			if isinstance(state_obj, State):
				state_obj.on_enter(subject, self.__context, self)

	def has_state(self, state):
		return str(state) in self.__definition.states

	def can(self, subject, transition_obj):
		transition_name = str(transition_obj)
		active_state = self.get_state(subject)
		transitions = filter(
			lambda t: t.name == transition_name, 
			self.__definition.transitions)
		
		if transitions:
			for transition in transitions:
				if transition.source.name == active_state:
					return True
			return False
		else:
			raise TransitionNotDefined(
				'Trasition {0} is not defined'.format(transition_name))

	def apply(self, subject, transition_name, **params):
		transition_name = str(transition_name)
		transitions = filter(
			lambda t: t.name == transition_name,
			self.__definition.transitions)
		
		if transitions:
			states = self.get_states(subject)
			for transition in self.transitions:
				if transition.source.name in states \
					and transition.guard(subject):
					places.remove(transition.source.name)
					transition.source.on_leave(subject, self.__context, self)
					transition.on_transition(subject, self.__context, self, **params)
					transition.target.on_enter(subject, self.__context, self)
					return True
			raise TransitionNotPermitted('Transition "{0}" not allowd from "{1}"'.format(
				self.transition.name,
				', '.join(states)
			))
		raise TransitionNotDefined('Transition "{0}" is not defined!'.format(transition_name))

	def as_dict(self, subject=None):
		ret = {
			'definition': self.__definition.as_dict(),
		}
		if hasattr(self.__context, 'as_dict'):
			ret['context'] = self.__context.as_dict()
		elif isinstance(self.__context, dict):
			ret['context'] = self.__context
		
		if subject:
			if hasattr(subject, 'as_dict'):
				ret['subject'] = subject.as_dict()
			elif isinstance(subject, dict):
				ret['subject'] = subject
		
		return ret


class DefinitionDumper(object):
	@staticmethod
	def dump_dot(definition):
		dot = 'digraph finite_state_machine {\n'
		dot += '  node [shape = ellipse style=filled]; {0};\n'.format(definition.initial_state)
		dot += '  node [shape = ellipse style=none];\n'
		for transition in definition.transitions:
			dot += '  {0} -> {1} [label="{2}"];\n'.format(
				transition.source.name,
				transition.target.name,
				transition.name
			)
		dot += '}'
		return dot


def create_state(state, on_enter=None, on_leave=None):
	return State(state, on_enter, on_leave)

def create_transition(transition, source, target, guard=None, on_transition=None):
	return Transition(transition, source, target, guard, on_transition)

def create_definition(states, transitions, initial_state=None):
	return WorkflowDefinition(
		states,
		transitions,
		initial_state
	)

def create_workflow(definition, context):
	return WorkFlow(definition, context)

def dump_dot(definition):
	return DefinitionDumper.dump_dot(definition)


def main():
	init = create_state('INIT')
	waiting_socket = create_state('WAITING_SOCKET')
	defined_socket = create_state('DEFINED_SOCKET')
	waiting_rpc = create_state('WAIT_RPC')
	loaded_rpc = create_state('LOADED_RPC')
	validation = create_state('VALIDATION')
	working = create_state('WORKING')

	definition = create_definition([
		init, working, waiting_rpc, waiting_socket, defined_socket,
		loaded_rpc, validation
	], [
		create_transition('start', init, waiting_rpc),
		create_transition('start', init, waiting_socket),
		create_transition('loaded_rpc', waiting_rpc, loaded_rpc),
		create_transition('define_socket', waiting_socket, defined_socket),
		create_transition('run_validate', defined_socket, validation),
		create_transition('run_validate', loaded_rpc, validation),
		create_transition('validated', validation, working),
		create_transition('corrupted', working, loaded_rpc),
		create_transition('corrupted', working, waiting_socket),
		create_transition('corrupted', validation, init),
		create_transition('corrupted', defined_socket, init),
		create_transition('define_socket', working, working)
	])

	print(dump_dot(definition))
	
	workflow = create_workflow(definition, {})
	sbj = {}
	workflow.start(sbj)
	import pdb; pdb.set_trace()
	print(workflow.can(sbj, 'start'))

		

if __name__ == '__main__':
	main()