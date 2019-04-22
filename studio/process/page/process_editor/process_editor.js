frappe.pages['process-editor'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Process Editor',
		single_column: true
	});
}