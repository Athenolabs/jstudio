var Class = require('classy.js');

var Emitter = Class.$extend({
	on: function(name, callback, ctx){
		var e = this.e || (this.e = {});

		(e[name] || (e[name] = [])).push({
			fn: callback,
			ctx: ctx
		});

		return this;
	},
	once: function(name, callback, ctx){
		var self = this;
		function listener () {
			self.off(name, listener);
			callback.apply(ctx, arguments);
		}
		listener._ = callback;
		this.on(name, listener, ctx);
	},
	emit: function(name){
		var data = [].slice.call(arguments, 1),
			evt_arr = ((this.e || (this.e = {}))[name || []).slice(),
			i = 0,
			len = evt_arr.length;

		for (i; i < len; i++){
			evt_arr[i].fn.apply(evt_arr[i].ctx, data);
		}
		return this;
	},
	off: function(name, callback){
		var e = this.e || (this.e = {}),
			evts = e[name],
			live_events = [];

		if (evts && callback){
			for (var i = 0, len = evts.length; i < len; i++){
				if (evts[i].fn !== callback && evts[i].fn._ !== callback){
					live_events.push(evts[i]);
				}
			}
		}

		live_events.length ? e[name] = live_events : delete e[name];

		return this;

	}
});

var ProcessDefinition = Class.extend({
	__classvars__: {
		Task: Task,
		process_builder: Class.extend({
			__classvars__: {
				start_task: function(){
					return ProcessDefinition.Task('start-task');
				},
				end_task: function(){
					return ProcessDefinition.Task('end-task');
				}
			},
			register_task: function(type, Task){
				this[camelize(type)] = Task;
			},
			create_task: function(type){
				return this[camelize(type)]();
			}
		})(),
		API: {
			create_process_definition(name){
				return ProcessDefinition(name, this);
			},
			load_process_definition: function(id){
				var dict = frappe.model.get('Process', id);
				if (dict){
					return ProcessDefinition.deserialize(this, dict);
				}
			},
			query_process_definition: function(filters){
				return frappe.model.get_all('Process', {'fields': ['*'], 'filters': filters})
			},
			import_process_definition: function(definition){
				var process_definition = this.create_process_definition(definition.name);
				process_definition.category = definition.category;

				var tasks_by_name = {};

				Object.keys(definition.tasks).forEach(function(name){
					var task_ = definition.tasks[name],
						task = ProcessDefinition.process_builder[task_.type] ? ProcessDefinition.process_builder[task_.type]() : process_builder[task_.type + 'Task']();
					task.name = name;
					Object.keys(task_).filter(function(k){ return k != 'type' }).forEach(function(key){
						task[key] = task_[key];
					});

					process_definition.add_task(task);
					tasks_by_name[task.name] = task;
				});

				definition.flows.forEach(function(flow){
					if (!tasks_by_name[flow.from]){
						frappe.raise('task[' + flow.from + '] of flow.from does not exists');
					} 
					if (!tasks_by_name[flow.to]){
						frappe.raise('task[' + flow.to + '] of flow.to does not exists');
					}
					process_definition.add_flow(
						tasks_by_name[flow.from],
						tasks_by_name[flow.to],
						flow.condition
					);
				});

				process_definition.variables = Object.assign({}, definition.variables);
				return process_definition;
			}
		},
		to_dict: function(engine, dict){
			var def = ProcessDefinition(null, engine);
			def.id = dict.id;
			def.name = dict.name;
			def.variables = dict.variables;
			def.category = dict.category;
			dict.tasks.forEach(function(task){
				def.add_task(Task.from_dict(task))
			});
			dict.tasks.forEach(function(task){
				function handle(flow) {
					var def_flow = {
						from: def.tasks[flow.from],
						to: def.tasks[flow.to]
					};
					if (flow.condition && flow.condition.length){
						def_flow.condition = eval(flow.condition);
					}
					return def_flow
				};
				def.tasks[task.id].incoming_flows = task.incoming_flows.map(handle);
				def.tasks[task.id].outgoing_flows = task.outgoing_flows.map(handle);
			});
			return def;
		}
	},
	__init__: function(name, engine){
		this.engine = engine;
		this.name = name;
		this.tasks = {};
		this.layout = null;
		this.variables = {};
		this.category = 'Default';
	},
	add_task: function(task){
		var id = task.id ? task.id : frappe.utils.uuid();
		task.id = id;
		this.tasks[id] = task;
	},
	add_flow: function(task_from, task_to, condition){
		if (!task_from || !task_to){
			frappe.raise('add_flow requires `task_from` or `task_to`');
		}

		var flow = {
			from: task_from,
			to: task_to,
			condition: condition
		};
		task_to && task_to.incoming_flows.push(flow);
		task_from && task_from.outgoing_flows.push(flow);
	},
	to_dict: function(){
		var tasks = this.tasks.map(function(task){
			return task.to_dict();
		}), dict = {
			doctype: 'Process',
			name: this.id,
			process_name: this.name,
			tasks: tasks,
			variables: this.variables,
			category: this.category
		}
		return dict;
	},
	save: function(){
		var dict = this.as_dict();
		if (!dict.name){
			this.id = frappe.model.insert(dict).name;
		} else {
			frappe.model.save(dict);
		}
	}
});

var Node = Emitter.$extend({
	__classvars__: {
		from_dict: function(dict, instance){
			var task = instance.def.tasks[dict.task],
				node = instance.create_node(task);
			node.process_instance = instance;
			node.task = task;
			node.deserialize();
			return node;
		}
	},
	__init__(task, process_instance){
		this.$super.apply(this, arguments);
		this.task = task;
		this.process_instance = process_instance;
		this.incoming_flow_complete_number = 0;
	},
	execute: function() {
		this.process_instance.emit('before', this.task);
		this.execute_internal(this.complete.bind(this));
	},
	execute_internal: function(complete){
		complete();
	},
	can_follow_outgoing_flow: function(flow){
		return true;
	},
	can_execute_node: function(){
		return this.incoming_flow_complete_number === this.task.incoming_flows.length;
	},
	complete: function(err, variables){
		if (err) {
			this.process_instance.change_status(process_instance.$class.STATUS.FAILED, err, function(){
				this.process_instance.emit('end');
			}.bind(this));

		}
		if (variables) {
			this.process_instance.variables = Object.assign({}, variables);
		}
		this.process_instance.emit('after', this.task);
		delete this.process_instance.node_pool[this.task.id];

		// Follow outgoing flows
		this.task.outgoing_flows.forEach(function(flow){
			if (!this.can_follow_outgoing_flow(flow)) return;

			var node;
			if (this.process_instance.node_pool[flow.to.id]){
				node = this.process_instance.node_pool[flow.to.id];
			} else {
				node = this.process_instance.create_node(flow.to);
				this.process_instance.node_pool[flow.to.id] = node;
			}
			node.incoming_flow_complete_number ++;

			// Need to decide whether to execute next node
			if (node.can_execute_node()){
				node.execute();
			} else {
				// If Process instance status has veen suspended, need to save again because it's possible that
				// an async service task is started before the instance is suspended
				if (this.process_instance.status === ProcessInstance.$class.STATUS.WAITING){
					this.process_instance.save();
				}
			}
		}.bind(this));

		if (this.task.type === 'end-task') {
			this.process_instance.change_status(process_instance.$class.STATUS.COMPLETED, function(){
				this.process_instance.emit('end')
			}.bind(this));
		}
	},
	to_dict: function(){
		var dict = {
			doctype: 'Process Node',
			process_instance: this.process_instance.id,
			incoming_flow_complete_number: this.incoming_flow_complete_number,
			task: this.task.id
		}
		return dict;
	},
	from_dict: function(){}
});

var ProcessInstance = Emitter.$extend({,
	__classvars__: {
		STATUS: {
			NEW: 'New',
			RUNNING: 'Running',
			WAITING: 'Waiting',
			COMPLETED: 'Complete',
			FAILED: 'Failed'
		},
		API: {
			create_process_instance: function(def){
				var process_instance = ProcessInstance(def);
				process_instance.id = frappe.utils.uuid();
				this.process_pool[process_instance.id] = process_instance;
				return process_instance;
			},
			complete_task: function(process_id, task_id, variables){
				if (!this.process_pool[process_id]){
					this.load_process_instance(process_id, function(instance){
						this.process_pool[process_id].node_pool[task_id].complete(null, variables);
					}.bind(this));
				} else {
					this.process_pool[process_id].node_pool[task_id].complete(null, variables);
				}
			},
			load_process_instance: function(id, callback){
				var process_instance;
				if (this.process_pool[id]){
					process_instance = this.process_pool[id];
				} else {
					if (!frappe.model.exists('Process Instance', id)) return;
					process_instance = ProcessInstance.from_dict(this, frappe.model.get('Process Instance', id));
					this.process_pool[process_instance.name] = process_instance;
				}
				callback && callback(process_instance);
			},
			query_process_instance: function(filters){
				return frappe.model.get_all('Process Instance', {'fields': ['*'], 'filters':filters})
			},
			clear_pool: function(){
				Object.keys(this.process_pool).forEach(function(key){
					var instance = this.process_pool[key];
					if ([ProcessInstance.STATUS.WAITING, ProcessInstance.STATUS.COMPLETED].indexOf(instance.status) !== -1){
						delete this.process_pool[key];
					}
				}.bind(this))
			}
		},
		from_dict: function(engine, dict){
			var def = engine.load_process_definition(dict.def),
				instance = ProcessInstance(def);
			instance.id = dict.id;
			instance.status = dict.status;
			instance.variables = dict.variables;
			instance.error = dict.error;
			dict.node_pool.forEach(function(dict){
				var node = Node.from_dict(node, instance);
				instance.node_pool[node.task.id] = node;
			});
			return instance;
		}
	},
	__init__: function(def){
		this.$super.apply(this, arguments);
		this.engine = def.engine;
		this.id = null;
		this.def = def;
		
		// The active node instances (key, task id)
		this.node_pool = {};
		this.status = this.$class.STATUS.NEW;
		this.variables = {};
		this.error = null;
	},
	create_node: function(task){
		var task_type = this.engine.task_type[task.type],
			node;
		if (!task_type){
			node = new Node(task, this);
		} else {
			node = new task_type[1](task, this);
		}
		return node
	},
	get_node: function(task_name){
		for (var key in this.node_pool){
			if (this.node_pool[key].task.name === task_name){
				return this.node_pool[key];
			}
		}
	},
	_start: function(variables){
		this.variables = variables || this.def.variables;
		this.change_status(this.$class.STATUS.RUNNING, function(){
			var node = Node(this.def.tasks[0], this);
			node.execute();
		}.bind(this));
	},
	start: function(variables){
		if (!this.def._id){
			this.def.save(function(def){
				this.def._id = def.name;
				this._start(variables);
			}.bind(this))
		} else {
			this._start(variables);
		}
	},
	change_status: function (status, err, callback){
		this.status = status;
		this.error = err;
		this.save(callback);
	},
	save: function(callback){
		var dict = this.to_dict();
		if (dict.name){
			dict = frappe.model.save(dict);
		} else {
			dict = frappe.model.insert(dict);
		}
		callback && callback(dict);
	},
	to_dict: function(){
		var serialized_node_pool = function (){
			var serialized_nodes = [];
			Object.keys(this.node_pool).forEach(function(key){
				if (!this.node_pool.hasOwnProperty(key)) return;
				serialized_nodes.push(node.to_dict());
			})
			return serialized_nodes;
		}.bind(this);

		return {
			doctype: 'Process Instance',
			name: this.id,
			def: this.def.name,
			status: this.status,
			node_pool: serialized_node_pool(),
			variables: JSON.stringify(this.variables),
			error: this.error
		}
	}
});

function camelize(text, separator){
	separator = separator || '-';
	return text.split(separator).map(function(w){
		return w.replace(/./, function(m){
			return m.toUpperCase()
		})
	}).join();
}

var Task = Class.extend({
	__classvars__: {
		from_dict: function(dict){
			var task = process_builder.create_task(dict.type);
			task.from_dict(dict);
			return task
		}
	},
	__init__: function(type){
		this.id = null;
		this.name = null;
		this.type = null;
		this.incoming_flows = [];
		this.outgoing_flows = [];
	},
	to_dict: function(){
		function handle(flow){
			return {
				from: flow.from.id,
				to: flow.to.id,
				condition: flow.condition ? flow.condition.toString(): null
			};
		}

		return {
			id: this.id,
			name: this.name,
			type: this.type,
			incoming_flows: this.incoming_flows.map(handle),
			outgoing_flows: this.outgoing_flows.map(handle)
		};
	},
	from_dict: function(dict){
		this.id = dict.id;
		this.name = dict.name;
		this.type = dict.type;
	}
});

var Decision = Task.$extend({
	__init__: function(){
		this.$super.apply(this, arguments);
		this.type = 'decision';
	}
});

var ServiceTask = Task.$extend({
	__init__: function(action){
		this.$super.apply(this, arguments);
		this.type = 'service-task';
		this.action = action;
	},
	to_dict: function(){
		var dict = this.$super();
		dict.action = this.action.toString();
		return dict;
	},
	from_dict: function(dict){
		this.$super(dict);
		this.action = eval(dict.action);
	}
});

var ServiceNode = Node.$extend({
	execute_internal: function(complete){
		this.task.action(this.process_instance.variables, complete);
	}
});

var DecisionNode = Node.$extend({
	can_execute_node: function(next_node){
		return true;
	}
});

var HumanTask = Task.$extend({
	__init__: function(){
		this.$super.apply(this, arguments);
		this.type = 'human-task';
		this.assignee = null;
		this.candidate_users = [];
		this.candidate_groups = [];
	},
	to_dict: function(){
		var dict = this.$super();
		dict.assignee = this.assignee;
		dict.candidate_users = JSON.stringify(this.candidate_users);
		dict.candidate_groups = JSON.stringify(this.candidate_groups);
		return dict;
	},
	from_dict: function(dict){
		this.$super(dict);
		this.assignee = dict.assignee;
		this.candidate_users = JSON.parse(dict.candidate_users);
		this.candidate_groups = JSON.parse(dict.candidate_groups);
	}
});

var HumanTaskNode = Node.$extend({
	execute_internal: function(complete){
		var task_def = {
			process_id: this.process_instance.id,
			process_name: this.process_instance.def.name,
			process_variables: this.process_instance.variables,
			definition_id: this.process_instance.def.id
		};
		Object.assign(task_def, this.task);
		this.process_instance.engine.human_task_service.new_task(task_def, function(entity){
			this.tassk_entity_id = entity.id;
			// Put it in the waiting status
			this.process_instance.change_status(Instance.STATUS.WAITING);
		}.bind(this))
	}
});

var HumanTaskService = Class.$extend({
	__classvars__: {
		STATUS:	{
			NEW: 'New',
			RESERVED: 'Reserved',
			IN_PROGRESS: 'In Progress',
			COMPLETED: 'Completed'
		}
	},
	__init__: function(engine){
		this.engine = engine;
	},
	complete: function(task_id, variables){
		return this.query_one({'_id': task_id}, function(task){
			if (!task) frappe.raise('No task is found!');
			task.status = this.$class.STATUS.COMPLETED;
			task.completed_date = frappe.utils.now_datetime();
			this.save_task(task, function(){
				if (task.process_id !== undefined){
					this.engine.complete_task(task.process_id, task.task_def_id, variables);
				}
			}.bind(this));
		}.bind(this))
	},
	new_task: function(task_def){
		var task = {
			doctype: 'Activity',
			activity_name: task_def.name,
			status: task_def.assignee ? this.$class.STATUS.RESERVED : this.$class.STATUS.NEW,
			assignee: task_def.assignee,
			candidate_users: JSON.stringify(task_def.candidate_users),
			candidate_groups: JSON.stringify(task_def.candidate_groups),
			process_id: task_def.process_id,
			process_name: task_def.process_name,
			process_variables: JSON.stringify(task_def.process_variables),
			definition: task_def.definition_id,
			task_def_id: task_def.id,
		};
		return frappe.model.insert(task);
	},
	save_task: function(task){
		return frappe.model.update(task);
	},
	claim: function(task_id, user){
		var task = frappe.model.get('Activity', task_id);
		if (task) {
			if (task.assignee === user) return;
			if (task.candidate_users.indexOf(user) === -1) throw new Error('Cannot claim task because user is not the candidate');
			task.assignee = user;
			task.claimed_datetime = frappe.utils.now_datetime();
			task.status = this.$class.STATUS.IN_PROGRESS;
			this.save_task(task);
		}
	},
	start_working: function(task_id){
		var task = frappe.model.get('Activity', task_id);
		if (!task) throw new Error('No task is found!');
		task.status = this.$class.STATUS.IN_PROGRESS;
		task.started_work_date = frappe.utils.now_datetime();
		return this.save_task(task);
	},
	query: function(filters){
		return frappe.model.get_all('Actvity', {'fields': ['*'], 'filters': filters});
	},
	query_one: function(task_id){
		return frappe.model.get('Activity', task_id);
	}
});

var ProcessEngine = Class.$extend({
	__include__: [
		ProcessInstance.API,
		ProcessDefinition.API
	],
	__classvars__: {
		InstanceStatus: ProcessInstance.STATUS,
		HumanTaskServiceStatus: HumanTaskService.STATUS
	},
	__init__: function(options){
		this.next_process_id = 0;
		this.task_types = {};
		this.process_pool = {};
		this.definition_collection = {};
		this.instance_collecton = {};
		this.human_task_collection = {};
	},
	register_task_type: function(type, Task, Node){
		this.task_types[type] = [Task, Node];
		this.process_builder.register_task(type, Task);
	},
	create: function(options_){
		var options = options_ || {},
			process_engine = ProcessEngine(options);
		process_engine.process_builder = ProcessDefinition.process_builder;
		process_engine.register_task_type('service-task', ServiceTask, ServiceNode);
		process_engine.register_task_type('decision', Decision, DecisionNode);
		process_engine.register_task_type('human-task', Task, Node);
		process_engine.human_task_service = HumanTaskService(process_engine);
		return process_engine;
	}
});