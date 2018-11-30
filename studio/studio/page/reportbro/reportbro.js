frappe.pages['reportbro'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Reportbro',
		single_column: true,
		icon: 'fa fa-edit'
	});

	frappe.breadcrumbs.add('Studio');

	// Remove container class
	$(page.main).closest('.page-container').find('.page-head').addClass('hidden');
	setTimeout(function(){
		$(page.main).closest('.page-container').find('.page-head').remove();
	}, 500)
	$(page.main).closest('.page-body').css({
		'padding-right': '30px',
		'margin-top': '-68px'
	}).removeClass('container');

	//
	$('<div id="reportbro"></div>').appendTo(page.main);
	wrapper.rb = $('#reportbro').reportBro({
		reportServerUrl: '/api/method/studio.studio.page.reportbro.reportbro.report_run',
		saveCallback: function(){
			var report = wrapper.rb.getReport();
			frappe.call({
				'method': 'studio.studio.page.reportbro.reportbro.save_report',
				'args': {
					'report_name': 'abc',
					'data': JSON.stringify(report)
				},
				success: function(data){
					wrapper.rb.setModified(false);
				},
				error: function(){
					frappe.msgprint('Save report failed.')
				}
			})
		},
		adminMode: false,
		patterCurrencySymbol: get_currency_symbol(),
	});
}