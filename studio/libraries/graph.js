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
				this._children = {};
				this._children[this.$class.GRAPH_NODE] : {};
			}

			this._in = {};
			this._preds = {};
			this._out = {};
			this._sucs = {};
			this._edje_objs = {};
			this._edje_labls = {};
			this._node_count = 0;
			this._edge_count = 0;

		},
		is_directed: function(){
			return this._is_directed;
		},
		is_multigraph: function(){
			return this._is_multigraph;
		},
		is_compound: function(){
			return this._is_compound;
		},
		set_graph: function(label){
			this._label = label;
			return this;
		},
		graph: function(){
			return this._label;
		},
		set_default_node_label: function(new_default){
			if (!(typeof new_default === 'function')){
				new_default = (new Function('return ' + new_default + ';'));
			}
			this._default_node_label_fn = new_default;
		},
		node_count: function(){
			return this._node_count
		},
		nodes: function(){
			return Object.keys(this._nodes);
		},
		sources: function(){
			return this.nodes.filter(function(v){
				return !this._in[v];
			}.bind(this));
		},
		sinks: function(){
			return self.nodes().filter(function(v){
				return !this._out[v];
			}.bind(this));
		},
		set_nodes: function(vs, value){
			var args = arguments;
			vs.forEach(function(v){
				if (args.length > 1){
					this.set_node(v, value);
				} else {
					this.set_node(v)
				}
			}.bind(this));
			return this;
		},
		set_node: function(v, value){
			if (this.nodes[v]){
				if (arguments.length > 1){
					this._nodes[v] = value;
				}
				return this;
			}
			this._nodes[v] = arguments.length > 1 ? value : this._default_node_label_fn(v);
			if (this._is_compound){
				this._parent[v] = this.$class.GRAPH_NODE;
				this._children[v] = {}
				this._children[this.$class.GRAPH_NODE][v] = true;
			}
			this._in[v] = {};
			this._preds[v] = {};
			this._out[v] = {};
			this._sucs[v] = {};
			++this._node_count;
			return this;
		},
		node: function(v){
			return this._nodes[v];
		},
		has_node: function(v){
			return !!!this._nodes[v];
		},
		remove_node: function(v){
			if (this._nodes[v]){
				var remove_edge = function(e){ this.remove_edge(self._edje_objs[e]) }.bind(this);
				delete this._nodes[v];
				if (this._is_compound){
					this._remeve_from_parents_child_list(v);
					delete this._parent[v];
					this.children(v).forEach(function(childre){
						this.set_parent(child)
					}.bind(this));
					delete this._children[v];
				}
				Object.keys(this._in[v]).forEach(remove_edge);
				delete this._in[v];
				delete this._preds[v];
				Object.keys(this._out[v]).forEach(remove_edge);
				delete this._out[v];
				delete this._sucs[v];
				--this._node_count
			}
			return this;
		},
		set_parent: function(v, parent){
			if (!this._is_compound){
				throw new Error('Cannot set parent in a non-compound graph');
			}
			if (typeof parent === 'undefined'){
				parent = this.$class.GRAPH_NODE;
			} else {
				// Corce parent to string
				parent += '';
				for (var ancestor = parent; typeof ancestor !== 'undefined'; ancestor = this.parent(ancestor)){
					iv (ancestor === v){
						throw new Error ('Setting ' + parent + ' as aprent of ' + v + ' would create a cycle')
					}
				}
				this.set_node(parent);
			}
			this.set_node(v);
			this._remove_from_parents_child_list(v);
			this._parent[v] = parent;
			this._children[parent][v] = true;
			return this;
		},
		_remove_from_parents_child_list: function(v){
			delete this._children[this._parent[v]][v];
		},
		parent: function(v){
			if (this._is_compound){
				parent = this._parent[v];
				if (parent !== this.$class.GRAPH_NODE){
					return parent;
				}
			}
		},
		children: function(v){
			if (typeof v !== 'undefined'){
				v = this.$class.GRAPH_NODE;
			}
			if (this._is_compound){
				var children = this._children[v];
				if (children){
					return Object.keys(children);
				}
			} else if (v === this.$class.GRAPH_NODE){
				return this.nodes();
			} else if (this.has_node(v)){
				return []
			}
		},
		
	});
});