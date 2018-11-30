frappe.provide('studio');

studio.evaluate_depends_on = function(expression, doc){
	var out = null;
	if (expression.toLowerCase().substr(0,5) === "eval:"){
		out = new Function('doc', frappe.utils.format('try { return {0} } catch(e){ return false; }', [
			expression.substr(5)
		]))(doc.doc);
	} else if  (expression.toLowerCase().substr(0,3) === "fn:"){
		out = cur_frm.script_manager.trigger(
			expression.substr(3),
			cur_frm.doctype,
			cur_frm.docname
		);
	} else {
		var value = doc[expression];
		if (Array.isArray(value)) {
			out = !!value.length;
		} else {
			out = !!value
		}
	}
	return out;
}

studio.evaluate_value_processor = function(processor, doc){
	return (new Function('doc', frappe.utils.format('try { return {0} } catch(e) { void 0; }')))
}

studio.inflate_args = function(frm, mappings, args){
	(mappings || []).forEach(function(m){
		if (m.field.indexOf('.') === -1 && typeof(args[mappings]) === 'undefined' && typeof (frm.doc[m.field])!== 'undefined'){
			if (m.value_processor){
				args[m.argument] = studio.evaluate_value_processor(m.value_processor, frm.doc);
			} else {
				args[m.argument] = frm.doc[m.fieldname];
			}
		} else if (m.field.indexOf('.') > 0 ){
			var parts = m.field.split('.');
			if (!m.value_processor){
				args[m.argument] = frm.doc[parts[0]].map(function(r){
					return r[parts[1]];
				});
			} else {
				args[m.field] = studio.evaluate_value_processor(m.value_processor, frm.doc);
			}
		}
	});
	return args;
}

frappe.ui.form.ScriptManager = frappe.ui.form.ScriptManager.extend({
	get_handlers: function(event_name, doctype, name, callback){
		var handlers = this._super(event_name, doctype, name, callback),
			me = this;

		if (event_name === "refresh" && cur_frm){
			(handlers.new_style || handlers).push(
				function() {
					frappe.call({
						'method': 'studio.api.get_action_list',
						'args': {
							'dt': cur_frm.doctype,
						},
						'callback': function(res) {
							if (res && res.message && res.message.length){
								res.message.forEach(function(row){
									if ((row.depends_on && row.depends_on.length) && !studio.evaluate_depends_on(row.depends_on, {'doc': cur_frm.doc})){
										return;
									};
									cur_frm.add_custom_button(
										__(row.menu_label),
										function(){
											var with_dialog = !!(row.arguments && row.arguments.length),
												fields = (row.arguments || []).map(function(a){
													return {
														'label': __(a.label),
														'fieldtype': a.argtype,
														'fieldname': a.argname,
														'reqd': a.required,
														'options': a.options,
														'default': a.default,
														'depends_on': a.depends_on,
														'collapsible_when': a.collapsible_when
													};
												});
											
											if (!with_dialog){
												frappe.confirm(
													frappe.utils.format(__('You want to call the action {0} ?'), [__(row.menu_label)]),
													function(){
														var args = {};
														studio.inflate_args(cur_frm.doc, res.message['mappings'], args);
														frappe.call({
															'method': 'studio.api.run_action',
															'args': {
																'action': row.parent,
																'context': {
																	doc: cur_frm.doc
																},
																'kwargs': args
															},
															freeze: true,
															'callback': function(res){
																if (res.message && res.message.docs){
																	frappe.model.sync(res.message);
																	cur_frm.refresh();
																}
															},
														});
													}
												);
											} else {
												var d = frappe.prompt(
													fields,
													function(args){
														studio.inflate_args(cur_frm.doc, res.message['mappings'], args);
														frappe.call({
															'method': 'studio.api.run_action',
															'args': {
																'action': row.parent,
																'context': {
																	'doc': cur_frm.doc
																},
																'kwargs': args
															},
															freeze: true,
															'callback': function(res){
																if (res.message && res.message.docs){
																	frappe.model.sync(res.message);
																	cur_frm.refresh();
																}
															},
														});
														frappe.utils.format(__('Run Action {0}'), [row.menu_label]),
														__('Run')
													}
												), props = studio.inflate_args(cur_frm.doc, res.message['mappings'], {});
												Object.keys(props).forEach(function(k){
													var v = props[k];
													if (!Array.isArray(v)){
														d.set_value(k, v);
													}
												});
											}
										},
										__(row.menu_group)
									);
								});
							}
						}
					});
				}
			);
		}
		return handlers;
	}
});