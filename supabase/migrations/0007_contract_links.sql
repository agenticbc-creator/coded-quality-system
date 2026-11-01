-- ERPNext contracts mirror: link to programs and cohorts so the cross-segment record can show them.
alter table erp_contracts add constraint erp_contracts_program_id_fkey foreign key (program_id) references programs(id);
alter table erp_contracts add constraint erp_contracts_cohort_id_fkey foreign key (cohort_id) references cohorts(id);
notify pgrst, 'reload schema';
