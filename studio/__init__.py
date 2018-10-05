# -*- coding: utf-8 -*-
from __future__ import unicode_literals

__version__ = '0.0.1'

import frappe
from frappe.model.document import Document

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
			+ doc_events.get("*", {}).get(method, []):
			hooks.append(frappe.get_attr(handler))

		composed = compose(f, *hooks)
		return composed(self, method, *args, **kwargs)

	return composer

Document.hook = staticmethod(document_hook)