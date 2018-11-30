// Copyright (c) 2018, Maxwell Morais and contributors
// For license information, please see license.txt

frappe.ui.form.on('Process Form', {
	refresh: function(frm) {
		$(frm.wrapper).on('grid-row-render', function(e, grid_row){
			if (grid_row.doc.doctype === "Process Form Field"){
				var df = frappe.utils.filter_dict(grid_row.docfields, {'fieldname': 'children_of'})[0]; 
				df.options = [null].concat(frm.doc.fields.map(function(d){
					return {'value': d.fieldname, 'label': __(d.label)};
				}));
			}
		});
	}
});

frappe.ui.form.on('Process Form Field', 'label', function(frm, cdt, cdn){
	var d = locals[cdt][cdn],
		prefix = d.children_of ? d.children_of : '';
	frappe.model.set_value(cdt, cdn, 'fieldname', 
		[prefix, frappe.scrub(d.label).normalize('NFD').replace(/[\u0300-\u036f]/g, "")].join('.'));
});

frappe.ui.form.on('Process Form Field', 'children_of', function(frm, cdt, cdn){
	var d = locals[cdt][cdn],
		prefix = d.children_of ? d.children_of : '';
	frappe.model.set_value(cdt, cdn, 'fieldname', 
		[prefix, frappe.scrub(d.label).normalize('NFD').replace(/[\u0300-\u036f]/g, "")].join('.'));
});