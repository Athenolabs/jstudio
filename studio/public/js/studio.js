frappe.provide('studio');

studio.prompt = function(fields, callback, title, primary_label, secondary_label, auto_hide){
	if (typeof fields === "string"){
		fields = [{
			label: fields,
			fieldname: "value",
			fieldtype: "Data",
			reqd: 1
		}];
	}
	if (!$.isArray(fields)) fields = [fields];
	var d = new frappe.ui.Dialog({
		fields: fields,
		title: title || __("Enter Value")
	});
	d.set_primary_action(primary_label || __("Submit"), function(){
		var values = d.get_values();
		if (!values){
			return;
		}
		if (auto_hide) d.hide();
		callback(values);
	});
	secondary_label && d.get_close_btn().html(secondary_label);
	d.show();
	return d;
}

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

studio.inflate_args = function(doc, mappings, args){
	(mappings || []).forEach(function(m){
		if (m.fieldname.indexOf('.') === -1 && typeof(args[m.fieldname]) === 'undefined' && typeof (doc[m.fieldname]) !== undefined){
			if (m.value_processor){
				args[m.argument] = studio.evaluate_value_processor(m.value_processor, doc);
			} else {
				args[m.argument] = doc[m.fieldname];
			}
		} else if (m.fieldname.indexOf('.') > 0 ){
			var parts = m.fieldname.split('.');
			if (!m.value_processor){
				args[m.argument] = doc[parts[0]].map(function(r){
					return r[parts[1]];
				});
			} else {
				args[m.fieldname] = studio.evaluate_value_processor(m.value_processor, doc);
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
												fields = [{
													'fieldname': 'error_message',
													'fieldtype': 'HTML'
												}];
											fields = fields.concat((row.arguments || []).map(function(a){
												return {
													'label': a.argtype !== "Column Break" ? __(a.label) : null,
													'fieldtype': a.argtype,
													'fieldname': a.argname,
													'reqd': a.required,
													'hidden': a.hidden,
													'read_only': a.read_only,
													'options': a.options,
													'default': a.default,
													'depends_on': a.depends_on,
													'collapsible_when': a.collapsible_when
												};
											}));
											
											if (!with_dialog){
												frappe.confirm(
													frappe.utils.format(__('You want to call the action {0} ?'), [__(row.menu_label)]),
													function(){
														var args = {};
														studio.inflate_args(cur_frm.doc, row['mappings'], args);
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
															'callback': function(r){
																if (r.message && r.message.docs){
																	frappe.model.sync(r.message);
																	cur_frm.refresh();
																}
															},
														});
													}
												);
											} else {
												var props = studio.inflate_args(cur_frm.doc, row['mappings'], {}),
													d;

												d = studio.prompt(
													fields,
													function(args){
														debugger;
														studio.inflate_args(cur_frm.doc, row['mappings'], args);
														d.validated = true;

														var i;

														for (i = 0; i <= 1; i++){
															try {
																var code = [row.details.on_arguments_process, row.on_arguments_process][i];
																if (code){
																	(new Function('dialog', 'values', 'ctx', code)).apply(null, [d, args, row.ctx]);
																}
															} catch (e) {
																d.validated = false;
																if (!d.validation_message) d.validation_message = "";
																d.validation_message += frappe.utils.format(
																	'<br/><b>{0}</b>: {1}<br/><pre>{2}</pre>',
																	[__('JS Argument Processor Error'), (e.message || ""), e.stack]
																);
															}
															if (!d.validated) {
																break;
															}
														}

														if (!d.validated){
															d.set_df_property('error_message', 'options', '<span class="text-danger">' + d.validation_message + "</span>");
														} else {
															// Set timeout is not a good solution for that situation, but,
															// there's no way to know if the the argument processors, are handling Promisses!
															d.hide();
															setTimeout(function(){
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
																	'callback': function(r){
																		if (r.message && r.message.docs){
																			frappe.model.sync(r.message);
																			cur_frm.refresh();
																		}
																	},
																});
															}, d.wait_timeout || 50);
														}
													},
													row.details.dialog_title,
													row.primary_button_label,
													row.cancel_button_label
												);
												
												Object.keys(props).forEach(function(k){
													var v = props[k];
													if (!Array.isArray(v)){
														d.set_value(k, v);
													}
												});

												var i;
												for (i = 0; i <= 1; i++){
													try {
														var code = [row.details.on_dialog_setup, row.on_dialog_setup][i];
														if (code){
															(new Function('dialog', 'ctx', code)).apply(null, [d, row.ctx]);
														}
													} catch (e){
														frappe.msgprint(
															frappe.utils.format(
																'<b>{0}</b>: {1}<br/><pre>{2}</pre>',
																[__('JS Dialog Setup Error'), (e.message || ""), e.stack]
															)
														);
													}
												}
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

