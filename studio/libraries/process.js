var Class = require('classy');

function snake(s){ 
	
 }

var Task = Class.$extend({
	__init__: function(type){
		this.id = null;
		this.name = null;
		this.type = type;
		this.incoming_flows = [];
		this.outgoing_flows = [];
	},
	serialize: function(){
		function handle_flow(flow){
			return {
				from: flow.from.id,
				to: flow.to.id,
				condition: flow.condition ? flow.condition.toString() : null
			}
		}
		return {
			id: this.id,
			name: this.name,
			type: this.type,
			incoming_flows: this.incoming_flows.map(handle_flow),
			outgoing_flows: this.outgoing_flows.map(handle_flow)
		};
	},
	deserialize: function(entity){
		this.id = entity.id;
		this.name = entity.name;
		this.type = entity.type;
	},
	__classvars__: {
		deserialize: function(entity){
			task = process_builder.create_task(entity.type);
			task.deserialize(entity);
			return task;
		}
	}
});

var ProcessBuilder = Class.extend({
	start_task: function(){
		return Task('start-task');
	},
	end_task: function(){
		return Task('end-task');
	},
	register_task: function(type, task){
		this[snake(type)] = function
	}
})