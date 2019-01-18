!function (definition) {
	if (typeof module != 'undefined' && module.exports) module.exports = definition()
	else if (typeof define == 'function' && typeof define.amd == 'object') define(definition)
	else this.Graph = definition()
	 }(function (undefined) {
	var Class = require('classy.js'),
		DEFAULT_EDGE_NAME = '\x00',
		GRAPH_NODE = '\x00',
		EDGE_KEY_DELIM = '\x01';

	return Class.extend({
		__init__: function(opts){
			this._is_directed = opts.directed || true;
			this._is_multigraph = opts.multigraph || false;
			this._is_compound = opts.compound || false;
			this._label = undefined;
			this._default_node_label_fn =  undefined;
			this._default_edge_label_fn = undefined;
			this._nodes = {}

			if (this._is_compound){
				this._parent = {};
				this._children = {
					this.$class.GRAPH_NODE: {}
				}
			}
		}
	});
});