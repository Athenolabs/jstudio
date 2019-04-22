frappe.provide('studio.flow');

studio.flow.FlowItem = Class.extend({
	init: function(opts){
		var args = typeof opts === 'undefined' ? {} : opts,
			default_args = {
				frm: null
			};
		Object.assign(this, default_args, args);
	},
	destroy: function(){},
	setup: function(){}
});