// Copyright (c) 2018, Maxwell Morais and contributors
// For license information, please see license.txt

frappe.ui.form.on('Process Form Field', {
	form_render: function(frm, cdt, cdn) {
		var d = locals[cdt][cdn],
			grid_row = frm.fields_dict[d.parentfield].grid.grid_rows_by_docname[cdn],
			df = frappe.utils.filter_dict(grid_row.docfields, {'fieldname': 'children_of'})[0]; 
		df.options = [null].concat(frm.doc.fields.filter(f=>{
			return f.fieldtype == "Table";
		}).map(function(d){
			if (d.fieldname){
				return {'value': d.fieldname, 'label': __(d.label)};
			}
		}).filter(o=>{ return o && o.value; }));
		df.hidden = df.options.length <= 1;
		grid_row.refresh_field(df.fieldname);
	},
	label: function(frm, cdt, cdn){
		var d = locals[cdt][cdn],
			prefix = (d.children_of ? d.children_of + '.' : '') ;
		frappe.model.set_value(cdt, cdn, 'fieldname', 
			[prefix, frappe.scrub(d.label).normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 _]/g, "")].join(''));
	},
	children_of: function(frm, cdt, cdn){
		var d = locals[cdt][cdn],
			prefix = (d.children_of ? d.children_of + '.' : '') ;
		frappe.model.set_value(cdt, cdn, 'fieldname', 
			[prefix, frappe.scrub(d.label).normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 _]/g, "")].join(''));
	}
});
