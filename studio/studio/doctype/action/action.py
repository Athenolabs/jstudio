# -*- coding: utf-8 -*-
# Copyright (c) 2018, Maxwell Morais and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe.utils import get_url
from uuid import uuid4

class Action(Document):
	def autoname(self):
		if not self.get('name'):
			self.name = str(uuid4())
		if self.allow_external_access:
			self.external_url = get_url() + '/api/action/{0}'.format(self.name)

	def validate(self):
		if not self.is_new():
			if self.allow_external_access:
				self.external_url = get_url() + '/api/action/{0}'.format(self.name)
			elif self.external_url:
				self.external_url = None