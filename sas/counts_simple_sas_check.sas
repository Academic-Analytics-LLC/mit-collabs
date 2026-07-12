/**********************************************************************************
 Counts (Simple) replicated in SAS, from details_base.csv
 ---------------------------------------------------------------------------------
 counts_simple.html itself was built from the OLDER collabs.csv / MITCollabs prototype
 pipeline (build_counts_simple3.py), not from details_base.csv. This script recomputes
 the SAME metrics -- per department/college/institution, per Unit Type (Department vs
 Program, Medical always included), for within/across/inter/intra/all scopes:

   works    = count of DISTINCT works (never double-count a shared paper)
   collabs  = total co-authorship PAIR INSTANCES with multiplicity (a paper with 3
              MIT co-authors from the same unit contributes 3 "within" pairs, i.e.
              C(3,2), not 1 work)

 -- but sourced from details_base.csv (the newer SAS "source of truth" already used by
 details_table.html and details_unit_tests.sas), since that's the more authoritative
 extract going forward. Expect numbers VERY CLOSE to but not always bit-identical to
 the live counts_simple.html page -- there's an already-documented small work-universe
 variance between the two pipelines (16,738 vs 16,747 total works, concentrated in
 HST/IMES). That's expected, not a bug in this script.

 Formulas (same as build_counts_simple3.py), per work, per entity key k (a UnitId or
 College or the institution):
   m         = count of MIT people on this work whose unit-set includes k
   mit_total = count of distinct MIT people on this work
   n_ext     = count of non-MIT (external) people on this work
   within pairs = C(m,2)                 works: works with m>=2
   across pairs = m * (mit_total - m)    works: works with mit_total > m
   inter  pairs = m * n_ext              works: works with n_ext > 0 (and m>=1)

 details_base.csv is work-grain, both-sides-exploded (one row per focal-scholar's
 (unit,college,discipline) combo x work x collaborator's combo) -- NOT anchor-
 restricted, so every MIT person who co-authored a work appears as the FOCAL side of
 at least one row for that work (this is what makes the Details page's per-work roster
 reconstruction correct, and what this script leans on too: the focal-side rows alone,
 deduped, ARE the full MIT roster of a work).

 Update &detailsloc. below, then run. Output:
   - counts_simple_sas.csv    -> one row per (unit_kind, level, id, label) with the
                                  works+collabs columns for all 5 scopes
   - log: Physics (8950) spot-check printed at the end -- oracle-adjacent (SAS-sourced,
     so expect ~948 within works, not exactly the prototype's 948 to the pair-count
     since collabs is a NEW metric with no prior oracle; the WORKS side (within/across)
     should closely track the already-validated Physics numbers).
**********************************************************************************/

%let detailsloc = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\sas\details_base.csv;
%let outputloc  = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\sas;

proc printto log="&outputloc.\counts_simple_sas_check.log" new; run;

/*** 1. Import (guessingrows=3000000 -- see details_unit_tests.sas note on why a small
   guessingrows silently truncates UnitType's informat and breaks the WHERE filter). ***/
proc import datafile="&detailsloc."
	out=details replace dbms=csv; guessingrows=3000000; getnames=yes;
run;

data details0;
	set details;
	PersonId_c = cats(PersonId);
	Collab_PersonID_c = cats(Collab_PersonID);
	Collab_ID_c = cats(Collab_ID);
	UnitId_c = cats(UnitId);
run;

/*** 2. Per unit_kind (Department/Program, Medical always included), build:
     person_unit   -- distinct (work, MIT person, UnitId, College) from the FOCAL side
     mit_per_work  -- distinct (work, MIT person) -> mit_total per work
     ext_per_work  -- distinct (work, external person) from Collab_Dir='External' rows
                      -> n_ext per work (unit_kind-independent, computed once)
   then for level in (department [group=UnitId], college [group=College]):
     unit_member   -- count distinct MIT person per (work, group key) = m
     joined        -- unit_member + mit_per_work total + ext_per_work total, per work
     pairs         -- per-(work,key) within/across/inter pair counts (the formulas above)
     rollup        -- per key: works (distinct work with a qualifying pair) + collabs
                      (sum of pair counts) for each of the 5 scopes
***/

proc sql;
	create table ext_per_work as
	select distinct Collab_ID_c as wid, Collab_PersonID_c as pid
	from details0
	where Collab_Dir = 'External';
quit;
proc sql;
	create table ext_count as
	select wid, count(distinct pid) as n_ext
	from ext_per_work
	group by wid;
quit;

%macro rollup_level(unit_kind=, level=, groupcol=, labelcol=);

	proc sql;
		create table details_&unit_kind._&level. as
		select distinct Collab_ID_c as wid, PersonId_c as pid, &groupcol. as gkey, &labelcol. as glabel
		from details0
		where UnitType in %if &unit_kind.=Department %then %do; ('Department','Medical','Clinical') %end;
			%else %do; ('Program','Medical','Clinical') %end;
			and &groupcol. is not missing
		;
	quit;

	proc sql;
		create table mit_per_work_&unit_kind._&level. as
		select distinct wid, pid
		from details_&unit_kind._&level.;
	quit;
	proc sql;
		create table mit_count_&unit_kind._&level. as
		select wid, count(distinct pid) as mit_total
		from mit_per_work_&unit_kind._&level.
		group by wid;
	quit;

	proc sql;
		create table unit_member_&unit_kind._&level. as
		select wid, gkey, glabel, count(distinct pid) as m
		from details_&unit_kind._&level.
		group by wid, gkey, glabel;
	quit;

	proc sql;
		create table joined_&unit_kind._&level. as
		select u.wid, u.gkey, u.glabel, u.m,
			coalesce(mc.mit_total, u.m) as mit_total,
			coalesce(ec.n_ext, 0) as n_ext
		from unit_member_&unit_kind._&level. u
		left join mit_count_&unit_kind._&level. mc on u.wid = mc.wid
		left join ext_count ec on u.wid = ec.wid
		;
	quit;

	data pairs_&unit_kind._&level.;
		set joined_&unit_kind._&level.;
		within_pairs  = m * (m - 1) / 2;
		across_pairs  = m * (mit_total - m);
		inter_pairs   = m * n_ext;
		flag_within = (m >= 2);
		flag_across = (mit_total > m);
		flag_inter  = (n_ext > 0);
		flag_intra  = (flag_within or flag_across);
		flag_all    = (flag_intra or flag_inter);
	run;

	proc sql;
		create table rollup_&unit_kind._&level. as
		select gkey as id length=20, glabel as label length=100,
			"&unit_kind." as unit_kind length=12, "&level." as level length=12,
			count(distinct case when flag_within=1 then wid end) as within_works,
			count(distinct case when flag_across=1 then wid end) as across_works,
			count(distinct case when flag_inter=1  then wid end) as inter_works,
			count(distinct case when flag_intra=1  then wid end) as intra_works,
			count(distinct case when flag_all=1    then wid end) as all_works,
			sum(within_pairs) as within_collabs,
			sum(across_pairs) as across_collabs,
			sum(inter_pairs)  as inter_collabs
		from pairs_&unit_kind._&level.
		group by gkey, glabel
		order by calculated all_works desc
		;
	quit;

	proc append base=rollup_all data=rollup_&unit_kind._&level. force; run;

%mend;

proc datasets lib=work nolist; delete rollup_all; run; quit;

%rollup_level(unit_kind=Department, level=department, groupcol=UnitId_c,  labelcol=Department);
%rollup_level(unit_kind=Department, level=college,    groupcol=College,   labelcol=College);
%rollup_level(unit_kind=Program,    level=department, groupcol=UnitId_c,  labelcol=Department);
%rollup_level(unit_kind=Program,    level=college,     groupcol=College,   labelcol=College);

/*** 3. Institution level -- unit_kind-independent (one row: MIT). "across" is always
   0 by definition (no unit above the institution to be "across" from). ***/
proc sql;
	create table mit_per_work_inst as select distinct wid, pid from details0
	where UnitType in ('Department','Program','Medical','Clinical');
quit;
proc sql;
	create table inst_pairs as
	select m.wid, count(distinct m.pid) as mit_total, coalesce(ec.n_ext,0) as n_ext
	from mit_per_work_inst m
	left join ext_count ec on m.wid = ec.wid
	group by m.wid, ec.n_ext;
quit;
data inst_pairs2;
	set inst_pairs;
	within_pairs = mit_total * (mit_total - 1) / 2;
	inter_pairs  = mit_total * n_ext;
	flag_within = (mit_total >= 2);
	flag_inter  = (n_ext > 0);
	flag_all    = (flag_within or flag_inter);
run;
proc sql;
	create table rollup_inst as
	select "123" as id length=20, "Massachusetts Institute of Technology" as label length=100,
		"Department" as unit_kind length=12, "institution" as level length=12,
		count(distinct case when flag_within=1 then wid end) as within_works,
		0 as across_works,
		count(distinct case when flag_inter=1 then wid end) as inter_works,
		count(distinct case when flag_within=1 then wid end) as intra_works,
		count(distinct case when flag_all=1 then wid end) as all_works,
		sum(within_pairs) as within_collabs,
		0 as across_collabs,
		sum(inter_pairs) as inter_collabs
	from inst_pairs2;
quit;
proc append base=rollup_all data=rollup_inst force; run;
data rollup_inst_prog; set rollup_inst; unit_kind = "Program"; run;
proc append base=rollup_all data=rollup_inst_prog force; run;

/*** 4. Export + Physics spot-check ***/
proc export data=rollup_all outfile="&outputloc.\counts_simple_sas.csv" replace; run;

title "Physics (8950) -- SAS-sourced counts_simple replica (expect within_works close to 948)";
proc print data=rollup_all noobs;
	where unit_kind = "Department" and level = "department" and id = "8950";
run;
title;

title "MIT institution row (expect all_works close to 16747, the SAS work universe)";
proc print data=rollup_all noobs;
	where level = "institution";
run;
title;

proc printto; run;  *restore normal log output;
