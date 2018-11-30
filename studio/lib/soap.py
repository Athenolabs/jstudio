import httplib
import time
import xml.dom
import frappe

from os.path import exists
from datetime import datetime
from urllib import splithost, splittype, urlopen
from xml.dom import minidom

NS = frappe._dict({
	'wsdl': 'http://schemas.xmlsoap.org/wsdl',
	'soap': 'http://schemas.xmlsoap.org/wsdl/soap/',
	'soap12': 'http://schemas.xmlsoap.org/wsdl/soap12/',
	'soap': 'http://schemas.xmlsoap.org/soap/envelope/'
})

USER_AGENT = 'coreflow_soap/0.1'
TIMEOUT = 60
DEBUG = False

class SOAPException(Exception):
	pass

class WSDLException(Exception):
	pass

class ServiceException(Exception):
	pass

class Service(object):
	'''
	Parse a WSDL file for a service and answer requests to the defined operations.
	Only works with document/literal-style services (e.g. Google)
	because types are almost completely ignored
	'''

	def __init__(self, wsdl, headers=None):
		self.operations = {}

		self.wsdl_path = wsdl
		self._load_wsdl(self.wsdl_path)
		if headers:
			self.add_headers_to_all(headers)

	def __repr__(self):
		return '<Service: {0}>'.format(self.wsdl_path)

	def _load_wsdl(self, path):
		"""
		Read and parse the WSDL
		"""
		self.wsdl = minidom.parse(open(path) if not path.startswith('http') else urlopen(path))
		target_ns = self.wsdl.documentElement.getAttribute('targetNamespace')
		self.get_services(target_ns)

	def get_services(self, ns):
		"""
		Parse information about the WSDL services
		"""

		services = self.wsdl.getElementsByTagName('wsdl:service')
		for service in services:
			self.get_ports(service, ns)

	def get_ports(self, service, ns):
		ports = service.getElementsByTagName('wsdl:port')

		for port in ports:
			name = port.getAttribute('name')
			binding = strip_ns(port.getAttribute('binding'))

			address10 = port.getElementsByTagName('soap:address')
			address12 = port.getElementsByTagName('soap12:address')

			addresses = address10 + address12

			if not len(addresses):
				raise WSDLException('No Service address found')
			else:
				uri = addresses[0].getAttribute('location')

			# get bindins for each port

			self.get_bindings(ns, port, binding, uri)

	def get_bindings(self, ns, port, binding, uri):
		bindings = self.wsdl.getElementsByTagName('wsdl:binding')

		for bind in bindings:
			if bind.getAttribute('name') == binding:
				self.get_operations(ns, port, binding, uri, bind)

	def get_operations(self, ns, port, binding, uri, bind):
		operations = self.wsdl.getElementsByTagName('wsdl:operation')

		for operation in operations:
			name = operation.getAttribute('name')
			self.operations[name] = Operation(operation, ns, port, binding, uri)

	def add_headers_to_all(self, headers):
		for operation in self.operations.values():
			op.add_headers(headers)

	def add_namespace_to_all(self, name, value):
		for operation in self.operations.values():
			operation.add_namespace_to_all(name, value)

	def __getattr__(self, name):
		if name in self.operations:
			return self.operations[name]
		else:
			raise KeyError(name)


class Operation(object):
	def __init__(self, node, ns, port, binding, uri):
		self._headers = {}
		self._request_ns = {}

		self.request = None
		self.response_doc = None

		self.name = node.getAttribute('name')
		
		self.ns = ns
		
		self.port = port
		self.binding = binding
		self.uri = uri

		# get soap Action
		operations10 = node.getElementsByTagName('soap:operation')
		operations12 = node.getElementsByTagName('soap12:operation')

		operations = operations10 + operations12

		if len(operations):
			self.soap_action = operations[0].getAttribute('soapAction')
		else:
			self.soap_action = ''

		# get output node name, for finessing output a bit

		self.response_node_name = ''
		output = node.getElementsByTagName('wsdl:output')
		if len(output) and output[0].hasAttribute('name'):
			self.response_node_name = output[0].getAttribute('name')

	def __repr__(self):
		return '<WS Operation: {0}>'.format(self.name)

	def add_header(self, name, value):
		self._headers[name] = value

	def add_headers(self, headers):
		self._headers.update(headers)

	def add_namespace(self, name, value):
		self._request_ns[name] = value

	def __call__(self, **kwargs):
		request = self.make_request(kwargs)
		response = self.send_request(request)
		return self.parse_response(response)

	def make_request(self, params):
		"""
		Create and serialize SOAP envelope from DOM document
		"""

		implementation = minidom.getDOMImplementation()

		self.request = implementation.createDocument(self.ns, 'soap:Envelope', None)

		set_doc_attr = self.request.documentElement.setAttribute

		set_doc_attr('xmlns:soap', NS.soap)

		for name, value in self._request_ns.iteritems():
			set_doc_attr('xmlns:{0}'.format(name), value)

		set_doc_attr('xmlns', self.ns)

		# create header
		if len(self._headers):
			header = self.request.createElementNS(ns.soap, 'soap:Header')
			self.add_literal(self.request, header, self._headers)
			self.request.documentElement.appendChild(header)

		# add body
		body = self.request.createElementNS(NS.soap, 'soap:Body')
		self.request.documentElement.appendChild(body)

		operation = self.request.createElement(self.name)
		if isinstance(params, dict):
			self.add_literal(self.request, operation, params)

		body.appendChild(operation)

		return self.request.toxml()

	def add_literal(self, doc, node, data):
		"""
		Recursive translate dictionaries into XML node
		"""

		for name, value in data.iteritems():
			if name.startswith('@'):
				node.setAttribute(name[1:], cstr(value))
			else:
				el = doc.createElement(name)

				if isinstance(value, (list, tuple, set)):
					for v in value:
						self.add_literal(doc, node, {name: v})
				else:
					self.add_value(doc, el, value)
					node.appendChild(el)

	def add_value(self, doc, el, value):
		if isinstance(value, dict):
			self.add_literal(doc, el, value)
		else:
			el.appendChild(doc.createTextNode(str(value)))

	def send_request(self, request):
		"""
		Push a request down a pipe to a HTTP/HTTPS server
		"""

		protocol, uri = splittype(self.uri)
		host, path = splithost(uri)

		if protocol == 'https':
			h = httplib.HTTPSConnection(host)
		else:
			h = httplib.HTTPConnection(host)

		if DEBUG:
			h.set_debuglevel(1)

		h.connect()
		h.sock.settimeout(TIMEOUT)

		headers = {'User-Agent': USER_AGENT, 'Content-Type': 'text/xml'}

		if self.soap_action:
			headers['SOAPAction'] = self.soap_action

		h.request('POST', path, request, headers)

		while True:
			response = h.getresponse()
			if response.status != 100: break
			h._HTTPConnection__state = httplib._CS_REQ_SENT
			h._HTTPConnection__response = None

		output = response.read()

		if DEBUG:
			print 'reply:', `output`

		return output

	def parse_response(self, response):
		"""
		Take a response XML document and turn it into a dictionary
		"""

		self.response = minidom.parseString(response)

		bodies = self.response.getElementsByTagName('soap:Body')
		if not len(bodies):
			raise SOAPException('No body in response')

		body = bodies[0]

		fault_strings = body.getElementsByTagName('soap:faultstring')
		if len(fault_strings):
			raise ServiceException(fault_strings[0].firstChild.nodeValue)

		response_data = self.parse_literal(body.childNodes)

		if self.response_node_name and self.response_node_name in response_data.keys():
			inner_resp = response_data[self.response_node_name]

			if len(inner_resp) == 1:
				return inner_resp.values()[0]
			else:
				return inner_resp

		else:
			return response_data

	def parse_literal(self, nodes):
		"""
		Process document/literal XML into a data structure composed from dictionaries, list and values.
		"""

		d = {}

		for n in nodes:
			if n.nodeType == xml.dom.Node.ELEMENT_NODE:
				if len(n.childNodes) == 1 and n.firstChild.nodeType == xml.dom.Node.TEXT_NODE:
					value = n.firstChild.nodeValue
				else:
					value = self.parse_literal(n.childNodes)

				# add a value to a dictionary, creating list if multiple values have the same key

				if n.nodeName in d:
					if isinstance(d[n.nodeName], list):
						d[n.nodeName].append(value)
					else:
						d[n.nodeName] = [d[n.nodeName], value]

				else:
					d[n.nodeName] = value

		return d

def strip_ns(str):
	"""
	Strip a namespace prefix from a string
	"""
	return str.split(":")[-1]



def get_soap_client(url):
	return Service(url)


def get_soap_methods(url):
	return get_soap_client(url).operations.keys()

def call_soap_method(url, method, kwargs=None):
	kwargs = kwargs or {}
	client = get_soap_client(url)
	if method not in client.operations:
		frappe.msgprint('Method {0} not found in {1}'.format(method, url))

	attr = getattr(client, method)
	res = attr(method, **kwargs)
	return res