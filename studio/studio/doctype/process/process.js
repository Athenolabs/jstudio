// Copyright (c) 2018, Maxwell Morais and contributors
// For license information, please see license.txt

frappe.ui.form.on('Process', {
	onload_post_render: function(frm){
		$(frm.wrapper).on('grid-row-render', (e, grid_row) => {
			if (grid_row.doc.doctype == "Process Flow"){
				var activities = frm.doc.activities.map(d => {
					return d.activity_name
				});
				['activity_name', 'next_activity'].forEach((d)=>{
					frappe.utils.filter_dict(grid_row.docfields, {'fieldname': d})[0].options = [null].concat(activities);
				});
			}
		});
	},
	refresh: function(frm) {

	}
});

frappe.ui.form.on('Process Flow', {
	next_activity: function(frm, cdt, cdn){
		let d = locals[cdt][cdn];
		if (d.activity_name == d.next_activity){
			frappe.model.set_value(cdt, cdn, 'next_activity', null)
		}
	}
});
