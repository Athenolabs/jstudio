frappe.pages['process'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Process',
		icon: 'octicon octicon-circuit-board',
		single_column: true
	});

	frappe.breadcrumbs.add('Studio');

	$('<div class="process-view" style="min-height: 200px; padding: 15px;"></div>').appendTo(page.main);
	wrapper.process_view = new studio.process.ProcessView(wrapper);
}

frappe.pages['process'].refresh = function(wrapper){
	wrapper.process_view.get_data();
}

frappe.provide('studio.process');

studio.process.ProcessView = class ProcessView {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = wrapper.page;
		this.body = $(this.wrapper).find('.process-view');
		this.params = {};
		this.data = {};
		this.cur_doc = null;
		this.cur_frm = null;
		this.form_section = null;
		this.form_wrapper = null;
		this.get_data();
	}

	get_data() {
		const me = this;
		let args = {};
		if (frappe.route_options){
			args = frappe.route_options;
			frappe.route_options = null;
		}
		frappe.call({
			module: 'studio.studio',
			page: 'process',
			method: 'get_process_info',
			args: args,
			callback: r => {
				me.data = r.message;
				$(frappe.render_template('process', r.message, {'pv': me})).appendTo(this.body.empty());
				me.bind_events();
			}
		});

	}

	bind_events() {
		const me = this;

		this.body.find('.view-process').each(function(){
			var el = $(this);
			el.on('click', function(e){
				e.preventDefault();
				frappe.route_options = {'process': el.data('process')};
				me.get_data();
			});
		});

		this.body.find('.btn-start-request').on('click', function(e){
			e.preventDefault();
			console.dir(me.data);
			me.start_request();
		});

		this.body.find('.activity-create:not(.disabled)').each(function(){
			var el = $(this);
			el.on('click', function(e){
				e.preventDefault();
				let request = el.data('request'),
					activity = el.data('activity'),
					form = me.get_form(request, activity);
				
				me.cur_doc = me.start_doc(request, activity, form);
				me.form_section = $(frappe.render_template('process_form', {form: form, doc: me.cur_doc})).appendTo(me.body.find('#form_' + activity).find('td').empty());
				me.body.find('#form_' + activity).toggleClass('hidden');
				me.form_wrapper = me.form_section.find('.process-form-wrapper');
				me.cur_frm = new studio.process.ProcessForm({
					doc: me.cur_doc,
					form: form,
					wrapper: me.form_wrapper
				});
			});
		});
	}

	start_request() {
		const me = this;
		frappe.prompt([{
			label: __('Subject'),
			fieldname: 'subject',
			fieldtype: 'Data',
			reqd: 1
		}], function(args){
			args.process = me.data.process.name;
			frappe.call({
				'method': 'studio.studio.doctype.process.process.initiate_request',
				'args': args,
				'async': false,
				'callback': function(r){
					frappe.route_options = {'process': me.data.process.name};
					me.get_data();
				}
			});
		},
		__('Initiate Request'),
		__('Start'));
	}

	get_form(request, activity){
		const request_data = frappe.utils.filter_dict(this.data.requests, {'name': request})[0],
			  activity_data = frappe.utils.filter_dict(request_data.tasks, {'name': activity})[0];
		return activity_data.form;
	}

	start_doc(request, activity, form){
		let now = frappe.datetime.now_datetime();
		return {
			'request': request,
			'activity': activity,
			'form': form.name,
			'__isnew': true,
			'owner': frappe.user.name,
			'creation': now,
			'modified_by': frappe.user.name,
			'modified': now
		};
	}

}

studio.process.ProcessForm = class Process {
	constructor(options) {
		Object.assign(this, options);
		this.render(this.doc, this.form);
	}

	render(doc, form){
		const query_params = frappe.utils.get_query_params();

		form.fields.map(df => {
			
			if (df.fieldtype === 'Table') {
				if (!Array.isArray(sdoc[df.fieldname])){
					sdoc[df.fieldname] = [];
				}
				df.get_data = () => {
					let data = [];
					if (sdoc) {
						data = sdoc[df.fieldname];
					}
					return data;
				}
				df.options = null;
			}


			if (df.fieldtype === 'Attach') {
				df.is_private = true;
			}

			delete df.parent;
			delete df.parentfield;
			delete df.parenttype;
			delete df.doctype;

			return df;

		});

		this.field_group = new frappe.ui.FieldGroup({
			body: this.wrapper[0],
			fields: form.fields
		});

		this.field_group.make();
		this.wrapper.find('.form-column').unwrap('.section-body');

		if (doc) {
			this.field_group.set_values(doc);
		}

		setTimeout(() => {
			this.field_group.fields_list.forEach(field_instance => {
				let instance_value = field_instance.value;
				if (instance_value != null && field_instance.df.fieldtype === "Attach" && instance_value.match('.(?:jpg|gif|jpeg|png)')) {
					field_instance.$input_wrapper.append(`<img src="${field_instance.get_value()}" width="auto" height=200 />`)
				}
			});
		}, 500);
	}

	get_values() {
		let values = this.field_group.get_values(this.allow_incomplete);
		if (!values) return null;
		values.process_task = this.task;
		return values;
	}

	get_field(fieldname) {
		const field = this.field_group.fields_dict[fieldname];
		if (!field) {
			throw `No field ${fieldname}`;
		} 
		return field;
	}

	get_input(fieldname){
		const $input = this.get_field(fieldname).$input;
		if (!$input){
			throw `Cannot get input for ${fieldname}`;
		}
		return $input;
	}

	get_value(fieldname){
		return this.field_group.get_value(fieldname);
	}

	set_value(fieldname, value){
		return this.field_group.set_value(fieldname);
	}

	set_field_property(fieldname, property, value){
		const field = this.get_field(fieldname);
		field.df[property] = value;
		field.refresh();
	}

	on(fieldname, fn){
		const field = this.get_field(fieldname);
		const $input = this.get_input(fieldname);
		$input.on('change', event => {
			return fn(field, field.get_value(), event);
		});
	}

	validate(){
		return true;
	}
}

studio.process.make_datatable = function(container, doctype){
	let web_list_start = 0;
}