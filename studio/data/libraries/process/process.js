let Class = require('classy.js');


let Process = Class.$extend({
	__classvars__: {
		SCHEMA: '/api/schemas/process.json'
	},
	__init__: function(){
		this.id = null;
		this.nodes = {};
		this.transitions = {};
		this.in_transitions = {};
		this.out_transitions = {};
		this.tokens = {};
	},
	set_id: function(id){
		this.id = id;
	},
	get_id: function(){
		return this.id;
	},
	set_execution_id: function(id){
		this.execution_id = id;
	},
	get_execution_id: function(){
		return this.execution_id;
	},
	get_node: function(id){
		let node = this.nodes[id];
		if (!node){
			throw (new Error('Node ' + id + ' not found.'));
		}
		node.set_process(this);
		return node;
	},
	get_transitions: function(){
		return this.transitions.map(function(transition){
			transition.set_process(this);
		});
	},
	get_start_transition: function(){
		let start_transitions = this.get_transitions();
		if (start_transitions.length !== 1){
			throw (new Error('There is one start tranistion expected but got "' + start_transitions.length + '"'));
		}
		return start_transitions[0];
	},
	get_start_transitions: function(){
		return this.get_transitions().filter(function(transition){
			return transition.get_from() === null;
		});
	},
	get_transition: function(id){
		let transition = this.transitions[id];
		if (!transition){
			throw (new Error('Transition "' + id + '" could not be found.'));
		}
		transition.set_process(this);
		return transition;
	},
	get_in_transitions: function(node){
		let in_transitions = this.in_transitions[node.get_id()] || [],
			transitions = {},
			id;
		for (id of in_transitions){
			transitions[id] = this.get_transition(id);
		}
		return transitions;
	},
	get_out_transitions: function(node){
		let out_transitions = this.out_transitions[node.get_id()] || [],
			transitions = {},
			id;
		for (id of out_transitions){
			transitions[id] = this.get_transitions(id);
		}
		return transitions;
	},
	get_out_transitions_with_name(node, name){
		let out_transitions = this.out_transitions[node.get_id()] || [],
			transitions = [],
			transition,
			id;
		for (id of out_transitions){
			transition = this.get_transition(id);
			if (transition.get_name() === name){
				transition.push(transition);
			}
		}
		return transitions;
	},
	register_node: function(node){
		node.set_process(this);
		this.nodes[node.get_id()] = node;
	},
	create_node: function(id){
		let node = Node();
		node.set_id(id || frappe.utils.uuid());
		this.register_node(node);
		return node;
	},
	create_transition: function(from, to, name){
		let transition = Transition();
		transition.set_name(name);
		transition.set_process(this);
		from && transition.set_from(from);
		to && transition.set_to(to);
		this.transitions[transition.get_id()] = transition;
		
		if (transition.get_from()){
			this.out_transitions[transition.get_from().get_id()] = transition.get_id();
		}
		if (transition.get_to()){
			this.in_transitions[transition.get_to().get_id()] = transition.get_id()
		}
		return transition;
	},
	break_transition(transition, node, new_name){
		let old_to = transition.get_to(),
			new_transition;
		transition.set_to(node);

		new_transition = this.create_transition(node, old_to);
		new_transition.set_name(new_name);
		new_transition.set_process(this);
		return new_transition
	}
});

let Node = Class.$extend({
	__classvars__: {
		SCHEMA: '/api/schemas/node.json'
	},
	__init__: function(){
		this.process = null;
		this.id = null;
		this.label = null;
		this.behavior = null;
		this.option = {};
	},
	get_process: function(){
		return this.process;
	},
	set_process: function(process){
		this.process = process;
	},
	get_id: function(){
		return this.id;
	},
	set_id: function(id){
		this.id = id;
	},
	get_label: function(){
		return this.label;
	},
	set_label: function(label){
		this.label = label;
	},
	get_behavior: function(){
		return this.behavior;
	},
	set_behavior: function(behavior){
		this.behavior = behavior;
	},
	set_option: function(key, value){
		this.option[key] = value;
	},
	get_option: function(key){
		return this.option[key];
	}
});

let Transition = Class.$extend({
	__classvars__ : {
		SCHEMA: '/api/schemas/transition.json'
	},
	__init__: function(){
		this.id = null;
		this.name = null;
		this.process = null;
		this.from = null;
		this.to = null;
		this.weight = null;
		this.async = null;
		this.active = null;
		this.state = null;

		this.set_id(frappe.utils.uuid()),
		this.set_weight(1);
		this.set_async(false);
		this.set_active(true);
	},
	set_id: function(id){
		this.id = id;
	},
	get_id: function(){
		return this.id;
	},
	set_name: function(name){
		this.name = name;
	},
	get_name: function(){
		return this.name;
	},
	set_process: function(process){
		this.process = process;
	},
	get_process: function(){
		return this.process;
	},
	get_from: function(){
		return this.from;
	},
	set_from: function(node){
		this.from = node.get_id();
	},
	get_to: function(){
		return this.to;
	},
	set_to: function(node){
		this.to = node.get_id();
	},
	get_weight: function(){
		return this.weight;
	},
	set_weight: function(weight){
		this.weight = weight;
	},
	is_async: function(){
		return new Boolean(this.async)
	},
	set_async: function(async){
		this.async = async;
	},
	is_active: function(){
		return this.is_active;
	},
	set_active: function(active){
		this.active = active;
	},
	get_state: function(){
		return this.state;
	}
});

let AsyncTransition = Class.$extend({
	transition: function(tokens){}
});

let AsyncTransitionIsNotConfigured = AsyncTransition.$extend({
	transition: function(tokens){
		throw (new Error('The async transition is not configured.'));
	}
});

let Token = Class.$extend({
	__classvars__: {
		SCHEMA: '/api/schemas/token.json'
	},
	__init__: function(){
		this.process = null;
		this.id = null;
		this.current_token_transition = null;
		this.transitions = [];
	},
	set_id: function(id){
		this.id = id;
	},
	get_id: function(){
		return this.id;
	},
	get_process: function(){
		return this.process;
	},
	set_process: function(process){
		this.process = process;
	},
	add_transition: function(transition){
		transition.set_process(this.get_process());
		this.transitions.push(transition);
		this.current_token_transition = transition;
	},
	get_current_transition: function(){
		if (!trhis.current_token_transition){
			this.current_token_transition = this.get_transitions()[0];
		}
		return this.current_token_transition;
	},
	get_transitions: function(){
		let me = this;
		return this.transitions.map(function(transition){
			transition.set_process(me.get_process());
		}).sort(function(a, b){
			if (a.get_time() > b.get_time()){
				return 1;
			} else if (a.get_time() < b.get_time()){
				return -1
			}
			return 0;
		});
	},
	get_to: function(){
		return this.get_current_transition().get_transition().get_to();
	},
	get_from: function(){
		return this.get_current_transition().get_transition().get_from();
	}
});

let TokenTransition = Class.$extend({
	__classvars__: {
		SCHEMA: '/api/schemas/token_transition.json',
		STATE_OPENED: 'Opened',
		STATE_PASSED: 'Passed',
		STATE_WAITING: 'Waiting',
		STATE_INTERRUPTED: 'Interrupted'
	},
	__init__: function(){
		this.id = null,
		this.process = null;
		this.transition_id = null;
		this.weight = null;
		this.state = null;
		this.time = null;
		this.reason = null;
	},
	set_id: function(id){
		this.id = id;
	},
	get_id: function(){
		return this.id;
	},
	set_transition_id: function(id){
		this.transition_id = id;
	},
	get_transition_id: function(){
		return this.transition_id;
	},
	get_process: function(){
		return this.process;
	},
	set_process: function(process){
		this.process = process;
	},
	get_transition: function(){
		return this.get_process().get_transition(this.get_transition_id());
	},
	get_weight: function(){
		return this.weight;
	},
	set_weight: function(weight){
		this.weight = weight;
	},
	get_state: function(){
		return this.state;
	},
	set_passed: function(){
		this.set_state(TokenTransition.STATE_PASSED);
	},
	is_passed: function(){
		return this.get_state() === TokenTransition.STATE_PASSED;
	},
	set_interrupted: function(){
		this.set_state(TokenTransition.STATE_INTERRUPTED);
	},
	is_interrupted: function(){
		return this.get_state() === TokenTransition.STATE_INTERRUPTED;
	},
	set_waiting: function(){
		this.set_state(TokenTransition.STATE_WAITING);
	},
	is_waiting: function(){
		return this.get_state() === TokenTransition.STATE_WAITING;
	},
	set_opened: function(){
		this.set_state(TokenTransition.STATE_OPENED);
	},
	is_opened: function(){
		return this.get_state() === TokenTransition.STATE_OPENED;
	},
	set_time: function(time){
		this.time = time;
	},
	get_time: function(){
		return this.time;
	},
	get_reason: function(){
		return this.reason;
	},
	set_reason: function(reason){
		this.reason = reason;
	},
	set_state: function(state){
		this.state = state;
	},
	create_for: function(transition, weight){
		let token_transition = TokenTransition();
		token_transition.set_id(frappe.utils.uuid());
		token_transition.set_transition_id(transition.get_id());
		token_transition.set_weight(weight);
		token_transition.set_opened();
		token_transition.set_time((new Date()).getTime());
		return token_transition;
	},
	create_for_new_state: function(token, state){
		let token_transition = this.create_for(
			token.create_current_transition().get_transition(),
			token.create_current_transition().get_transition().get_weight());
		
		token_transition.set_state(state);
		return token_transition;
	},	
});


let TokenLockerInterface = Class.$extend({
	locked: function(token_id){},
	lock: function(token_id, blocking){},
	unlock: function(token_id){}
});

let NulTokenLocker = TokenLockerInterface.$extend({
	locked: function(token){
		return false;
	}
});

let PessimisticLockException = Class.$extend({
	lock_failed: function(previous){
		return 'The pessimistic lock failed'
	}
});

let TokenException = Class.$extend({
	not_found: function(id){
		return 'Token "' + id + '" not found.'
	}
});


let ProcessBuilder = Class.$extend({
	__init__: function(process){
		this.process = process || Process();
		if (!this.process.get_id()){
			this.set_id(frappe.utils.uuid());
		}
	},
	set_id: function(id){
		this.process.set_id(id);
		return this;
	},
	register_node: function(node){
		node.set_process(this.process);
		this.process.nodes[node.get_id()] = node;
		return NodeBuilder(this, node);
	},
	create_node: function(id, behavior){
		let node = Node();
		node.set_id(id || frappe.utils.uuid());
		node.set_behavior(behavior());
		node.set_process(this.process);
		
		this.process.nodes[node.get_id()] = node;

		return NodeBuilder(this, node);
	},
	crate_transition(from, to, name){
		if (from instanceof String){
			from = this.process.get_node(from);
		}
		if (from && !(from instanceof Node)){
			throw (new Error('The from argument is invalid. Must be string or Node instance.'));
		}
		if (to instanceof String){
			to = this.process.get_node(to);
		}
		if (!(to instanceof Node)){
			throw (new Error('The to argument is invalid. Must be string or Node instance.'));
		}

		let transition = Transition();
		transition.set_name(name);
		transition.set_process(this.process);
		from && transition.set_from(from);
		to && transition.set_to(to);

		this.process.transitions[transition.get_id()] = transition;

		if (transition.get_from()){
			this.process.out_transitions[transition.get_from().get_id()] = transition.get_id();
		}

		if (transition.get_to()){
			this.process.in_transitions[transitions.get_to().get_id()] = transition.get_id();
		}
		return TransitionBuilder(this, transition);
	},
	create_start_transition: function(to, name){
		return this.create_transition(null, to, name);
	},
	break_transition: function(transition, node, new_name){
		let old_to = transition.get_to();
		transition.set_to(node);

		let new_transition = this.create_transition(node, old_to).get_transition();
		new_transition.set_name(new_name);
		new_transition.set_process(this.process);
		return TransitionBuilder(this, new_transition);
	},
	get_process: function(){
		return this.process;
	}
});

let TransitionBuilder = Class.$extend({
	__init__(process_builder, transition){
		this.process_builder = process_builder;
		this.transition = transition;
	},
	set_id: function(id){
		this.transition.set_id(id);
		return this;
	},
	set_name: function(name){
		this.transition.set_name(name);
		return this;
	},
	set_weight: function(weight){
		this.transition.set_weight(weight);
		return this;
	},
	set_async: function(async){
		this.transition.set_async(async);
		return this;
	},
	set_active: function(active){
		this.transition.set_active(active);
		return this;
	},
	end: function(){
		return this.process_builder;
	},
	get_transition: function(){
		return this.transition;
	}
});

let NodeBuilder = Class.$extend({
	__init__(process_builder, node){
		this.process_builder = process_builder;
		this.node = node;
		if (!this.node.id){
			this.node.set_id(frappe.utils.uuid());
		}
	},
	set_id: function(id){
		this.node.set_id(id);
		return this;
	},
	set_label: function(label){
		this.node.set_label(label);
		return this;
	},
	set_behavior: function(behavior){
		this.node.set_behavior(behavior);
		return this;
	},
	set_option: function(key, value){
		this.node.set_option(key, value);
		return this;
	},
	end: function(){
		return this.process_builder;
	},
	get_node: function(){
		return this.node;
	}
});

let Behavior = Class.$extend({
	execute: function(token){}
});

let BehaviorRegistry = Class.$extend({
	get: function(name){}
});

let DefaultBehaviorRegistry = Class.$extend({
	__init__: function(behaviors){
		this.behaviors = {};
		let me, name, behavior;
		for (name in behaviors){
			behavior = behaviors[name];
			this.register(name, behavior);
		}
	},
	register: function(name, behavior){
		if (Object.toString.call(behavior) === '[object function]'){
			behavior = CallbackBehavior(behavior);
		}
		if (!(behavior instanceof Behavior)){
			throw (new Error('The behavior must be callable or instance of Behavior'));
		}
		this.behaviors[name] = behavior;
	},
	get: function(name){
		if (!this.behaviors[name]){
			throw (new Error('Behavior is not registered with name: "' + name + '"'));
		}
		return this.behaviors[name];
	}
});

let EchoBehavior = Behavior.$extend({
	execute: function(token){
		frappe.msgprint(token.get_current_transition().get_transition().get_to().get_option('text'));
	}
});

let SignalBehavior = Behavior.$extend({
	signal: function(token){}
});

let CallbackBehavior = SignalBehavior.$extend({
	__init__(execute, signal){
		this._execute = execute;
		this._signal = signal;
	},
	execute: function(token){
		this._execute(token);
	},
	signal: function(token){
		if (this._signal){
			return this._signal(token);
		}
	}
});

let DAL = Class.$extend({
	create_process_token(process, id){},
	fork_process_token: function(token, id){},
	get_process_tokens: function(process){},
	get_process_token: function(process, id){},
	get_token: function(id){},
	persist_token: function(id){},
	persist_process: function(id){}
});

let InMemoryDAL = DAL.$extend({
	create_process_token(process, id){
		token = Token();
		token.set_id(id || frappe.utils.uuid());
		token.set_process(process);
		process.tokens[token.get_id()] = token;
		return token;
	},
	fork_process_token: function(token, id){
		this.create_process_token(token.get_process(), id);
	},
	get_process_tokens: function(process){
		return Object.values(process.tokens).map(function(token){
			token.set_process(process);
			return token;
		});
	},
	get_process_token: function(process, id){
		let token = process.tokens[id];
		if (!token){
			throw TokenException().notFound()
		}
		token.set_process(process);
		return token;
	},
});


let ProcessEngine = InMemoryDAL.$extend({
	__init__: function(behavior_registry, dal, async_transaction){
		this.behavior_registry = behavior_registry;
		this.dal = dal || InMemoryDAL();
		this.async_transaction = async_transaction || AsyncTransitionIsNotConfigured();
		this.async_tokens = [];
		this.wait_tokens = [];
	},
	proceed: function(token){
		try{
			frappe.publish_realtime('Start execution: process: ' + token.get_process().get_id() + ' token: ' + token.get_id())
			this.do_proceed(token);
			if (this.async_tokens.length){
				frappe.publish_realtime('Handle async transitions: ' + this.async_tokens.length);
				this.async_transaction.transition(this.async_tokens);
			}
			return this.wait_tokens;
		} finally {
			this.async_tokens = [];
			this.wait_tokens = [];
		}
	},
	do_proceed: function(token){
		let token_transition = token.get_current_transitio/n(),
			current_transition = token_transition.get_transition(),
			node,
			behavior,
			behavior_result,
			tmp_transitions = [],
			transitions = [],
			first;
		
		try {
			node = current_transition.get_to();
			if (!node){
				throw (new Error('Out node is missing. Process ' + token.get_process().get_id() + ', transition: ' + token_transition.get_id()));
			}
			frappe.publish_realtime('On transition: ' + (current_transition.get_from() ? current_transition.get_from().get_label() : 'start') + ' -> ' + (
				current_transition.get_to() ? current_transition.get_to().get_label() : 'end'
			));

			behavior = this.behavior_registry.get(node.get_behavior());

			if (token_transition.is_waiting()){
				if (!(behavior instanceof SignalBehavior)){
					throw (new Error('Expected SignalBehavior'));
				}
				frappe.publish_realtime('Signal Behavior: ' + node.get_behavior());
				behavior_result = behavior.signal(token);
			} else {
				frappe.publish_realtime('Execute behavior: ' + node.get_behavior());
				behavior_result = behavior.execute(token);
			}

			token.add_transition(
				TokenTransition.create_for_new_state(
					token,
					TokenTransition.STATE_PASSED));
			
			if (!behavior_result){
				token.get_process.get_out_transitions().forEach(function(transition){
					if (!transition.get_name()){
						tmp_transitions.push(transition)
					}
				});
			} else if (behavior_result instanceof String){
				tmp_transitions = token.get_process().get_out_transitions_with_name(node, behavior_result);
				if (!tmp_transitions){
					throw (new Error('The transition with the name ' + behavior_result + ' could not be found.'));
				}
			} else if (behavior_result instanceof Transition) {
				tmp_transitions = [behavior_result];
			} else if (Object.prototype.toString.call(behavior_result) === '[object Array]'){
				behavior_result.forEach(function(transition){
					var transitions_with_name = token.get_process().get_out_transitions_with_name(node, transition);
					if (!transition_with_name){
						throw (new Error('The transitions with the name ' + transition + ' could not be found.'))
					}
					if (transition instanceof String){
						tmp_transitions = tmp_transitions.concat(transitions_with_name);
					} else if (transition instanceof Transition){
						tmp_transitions.push(transition);
					} else {
						throw (new Error('Unsupported elemenent of array. Could be eigther instance of Transition or its name (string).'))
					}
				})
			} else {
				throw (new Error('Unsupported behavior result. Could be either instance of Transition, an array of Transitions, null or transition name (string).'));
			}

			transitions = [].concat(tmp_transitions);

			if (!transitions.length){
				this.persist_token(token);
				frappe.publish_realtime('End Execution');
				return;
			}

			first = true;	

		}
	}
})