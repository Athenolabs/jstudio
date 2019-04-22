// Copyright (c) 2019, Maxwell Morais and contributors
// For license information, please see license.txt

frappe.ui.form.on('Process', {
	refresh: function(frm) {

	}
});

frappe.ui.form.on('Process Tasks', {
	'task_type': function(frm, cdt, cdn){
		var d = locals[cdt][cdn],
			grid_row = frm.fields_dict[d.parentfield].grid.grid_rows_by_docname[cdn];
		grid_row.set_field_property('action', 'reqd', d.task_type==='Service Task');
		grid_row.refresh();
	}
})