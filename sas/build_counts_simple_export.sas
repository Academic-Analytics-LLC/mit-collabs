/**********************************************************************************
 Counts (Simple) v3 export - REAL SAS computation, work-grain, for counts_simple.html
 ---------------------------------------------------------------------------------
 Context: counts_simple.html's live data isn't flat entity totals - it's work-grain
 (per-work type/author-count/interdisciplinary flags, plus per-entity [work,pairs]
 arrays) so the page's Work Type filters, "Max co-authors per work" cap, and
 Person-level/Discipline drill all work client-side with no server round trip. This
 script does ALL the actual counting/classification in SAS (no SAS engine exists in
 the sandbox this was drafted in, so a Python stand-in was used there temporarily -
 this script replaces that stand-in with the real thing). Run this in your own SAS
 environment; hand the 6 CSVs it produces back and a small, purely-mechanical
 reshape step (no counting logic - just CSV-to-nested-JSON + compact index
 assignment) will wire them into counts_simple.html in place of the current data.

 Formulas (same convention as counts_simple_sas_check.sas / DECISIONS.md's
 "distinct works" convention used by Details/Counts Simple/Matrix/chord global):
   m         = distinct MIT people on a work whose unit-set (this unit_kind) includes key k
   mit_total = distinct MIT people on that work with ANY qualifying unit_kind affiliation
               (per work, shared across every group k for that unit_kind - not restricted to k)
   n_ext     = distinct external (Collab_Dir='External') people on that work
   within pairs = C(m,2)              (works: m>=2)
   across pairs = m*(mit_total-m)      (works: mit_total>m)
   inter  pairs = m*n_ext              (works: n_ext>0)
 Department mode filters UnitType in (Department,Medical,Clinical); Program mode
 filters (Program,Medical,Clinical) - Medical/Clinical always included in both
 (project rule: 3 unit types exist, "Clinical" is a data value, never UI text).

 Person-level (NEW vs. the original counts_simple_sas_check.sas, which only covered
 department/college/institution): uses the SAME "MIN(rel) any-overlap-wins"
 convention already validated project-wide (network_viz.html's pair-grain match,
 DECISIONS.md's "MIN(rel) any-overlap-wins collapse everywhere"). For a focal person
 + work, every other collaborator is deduped to ONE relationship even if seen via more
 than one of the focal person's own affiliation rows (min of Within Unit=0,
 Across Units=1, External/Across Institutions=2), then a work's "pairs" for a person
 = count of DISTINCT co-authors landing in that bucket for that work (no C(m,2) at
 person grain - a person just has N individual co-author relationships per work).

 TWO DEFINITIONS BELOW HAD TO BE INFERRED (the old build_counts_simple3.py that made
 the CURRENTLY-LIVE embedded data isn't available to inspect - it lives in the
 un-mounted MITCollabs sibling repo). Cross-checked against the live page's own old
 data and both hold up closely, but flagging for sign-off since they're reconstructed,
 not copied from a known-good source:
   - nAuthors[wid] = (distinct MIT people on the work, ANY unit type) + (distinct
     external people on the work). Matches the live page's old data's max/min EXACTLY
     (292 / 2 both sides) when checked in the Python stand-in run.
   - interdisc[wid] = 1 if the qualifying MIT people on that work span more than one
     distinct Discipline string value, else 0. Gives ~68.6% of works flagged vs the
     live page's old ~68.9% - very close, within the expected small work-universe
     variance between this SAS extract (16,747 works) and the old prototype's extract
     (16,738 works), not an exact-match guarantee.

 Update &detailsloc./&outputloc. below, then run. Output (6 CSVs to &outputloc.):
   counts_export_work_meta.csv    - wid, work_type, nAuthors, interdisc
   counts_export_entity_meta.csv  - unit_kind, level, id, label   (department/college/institution)
   counts_export_entity_pairs.csv - unit_kind, level, id, category, wid, pairs
   counts_export_person_meta.csv  - unit_kind, pid, label, rank
   counts_export_person_disc.csv  - unit_kind, pid, discipline   (long; joined with " | " downstream)
   counts_export_person_pairs.csv - unit_kind, pid, category, wid, pairs
 Deliberately NOT assigning a compact 0..N-1 work index here - that's a pure JS-side
 storage optimization, not counting logic, so it's left to the downstream reshape
 step to keep this script's job scoped to "get the numbers right."
**********************************************************************************/

%let detailsloc = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\sas\details_base.csv;
%let outputloc  = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\sas;

proc printto log="&outputloc.\counts_simple_export.log" new; run;

/*** 1. Import (guessingrows=3000000 -- a small guessingrows silently truncates
   UnitType's informat and breaks the WHERE filter - see details_unit_tests.sas). ***/
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

/*** 2. Work-level metadata: type, nAuthors, interdisc ***/

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

proc sql;
	create table mit_any_per_work as
	select distinct Collab_ID_c as wid, PersonId_c as pid
	from details0;
quit;
proc sql;
	create table mit_any_count as
	select wid, count(distinct pid) as mit_total_any
	from mit_any_per_work
	group by wid;
quit;

proc sql;
	create table work_type as
	select Collab_ID_c as wid, min(CollaborationType) as work_type length=40
	from details0
	group by wid;
quit;

proc sql;
	create table disc_per_work as
	select distinct Collab_ID_c as wid, Discipline
	from details0
	where Discipline is not missing;
quit;
proc sql;
	create table disc_count as
	select wid, count(distinct Discipline) as ndisc
	from disc_per_work
	group by wid;
quit;

proc sql;
	create table counts_export_work_meta as
	select a.wid,
		t.work_type,
		coalesce(a.mit_total_any,0) + coalesce(e.n_ext,0) as nAuthors,
		case when coalesce(d.ndisc,0) > 1 then 1 else 0 end as interdisc
	from mit_any_count a
	left join ext_count e on a.wid = e.wid
	left join work_type t on a.wid = t.wid
	left join disc_count d on a.wid = d.wid;
quit;

proc export data=counts_export_work_meta outfile="&outputloc.\counts_export_work_meta.csv" replace; run;

/*** 3. Department/college level, per unit_kind - m / mit_total / n_ext / pairs per
   (wid, gkey), exported LONG (one row per qualifying work per category) instead of
   collapsed to a grand total, so the client can filter by work type/author cap/
   interdisc without a server round trip. ***/

%macro export_level(unit_kind=, level=, groupcol=, labelcol=);

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
	run;

	/* entity metadata (id/label), one row per distinct gkey */
	proc sql;
		create table meta_&unit_kind._&level. as
		select "&unit_kind." as unit_kind length=12, "&level." as level length=12,
			gkey as id length=20, glabel as label length=100
		from pairs_&unit_kind._&level.
		group by gkey, glabel;
	quit;
	proc append base=counts_export_entity_meta data=meta_&unit_kind._&level. force; run;

	/* long pairs export: one row per (wid,gkey) per qualifying category */
	proc sql;
		create table exp_w_&unit_kind._&level. as
		select "&unit_kind." as unit_kind length=12, "&level." as level length=12,
			gkey as id length=20, "within" as category length=8, wid, within_pairs as pairs
		from pairs_&unit_kind._&level.
		where flag_within;
	quit;
	proc sql;
		create table exp_a_&unit_kind._&level. as
		select "&unit_kind." as unit_kind length=12, "&level." as level length=12,
			gkey as id length=20, "across" as category length=8, wid, across_pairs as pairs
		from pairs_&unit_kind._&level.
		where flag_across;
	quit;
	proc sql;
		create table exp_i_&unit_kind._&level. as
		select "&unit_kind." as unit_kind length=12, "&level." as level length=12,
			gkey as id length=20, "inter" as category length=8, wid, inter_pairs as pairs
		from pairs_&unit_kind._&level.
		where flag_inter;
	quit;
	proc append base=counts_export_entity_pairs data=exp_w_&unit_kind._&level. force; run;
	proc append base=counts_export_entity_pairs data=exp_a_&unit_kind._&level. force; run;
	proc append base=counts_export_entity_pairs data=exp_i_&unit_kind._&level. force; run;

%mend;

proc datasets lib=work nolist; delete counts_export_entity_meta counts_export_entity_pairs; run; quit;

%export_level(unit_kind=Department, level=department, groupcol=UnitId_c,  labelcol=Department);
%export_level(unit_kind=Department, level=college,    groupcol=College,   labelcol=College);
%export_level(unit_kind=Program,    level=department, groupcol=UnitId_c,  labelcol=Department);
%export_level(unit_kind=Program,    level=college,     groupcol=College,   labelcol=College);

/*** 4. Institution level - unit-kind independent (across N/A), duplicated into both
   modes downstream (same numbers either way - just JS convenience so it can index
   D.institution[uk] regardless of which mode is active). ***/
proc sql;
	create table inst_pairs as
	select m.wid, count(distinct m.pid) as mit_total, coalesce(ec.n_ext,0) as n_ext
	from mit_any_per_work m
	left join ext_count ec on m.wid = ec.wid
	group by m.wid, ec.n_ext;
quit;
data inst_pairs2;
	set inst_pairs;
	within_pairs = mit_total * (mit_total - 1) / 2;
	inter_pairs  = mit_total * n_ext;
	flag_within = (mit_total >= 2);
	flag_inter  = (n_ext > 0);
run;

data inst_meta;
	length unit_kind $12 level $12 id $20 label $100;
	unit_kind = "Department"; level = "institution"; id = "123";
	label = "Massachusetts Institute of Technology";
	output;
	unit_kind = "Program"; output;
run;
proc append base=counts_export_entity_meta data=inst_meta force; run;

proc sql;
	create table inst_w as
	select "Department" as unit_kind length=12, "institution" as level length=12,
		"123" as id length=20, "within" as category length=8, wid, within_pairs as pairs
	from inst_pairs2 where flag_within;
quit;
proc sql;
	create table inst_i as
	select "Department" as unit_kind length=12, "institution" as level length=12,
		"123" as id length=20, "inter" as category length=8, wid, inter_pairs as pairs
	from inst_pairs2 where flag_inter;
quit;
data inst_w_prog; set inst_w; unit_kind = "Program"; run;
data inst_i_prog; set inst_i; unit_kind = "Program"; run;
proc append base=counts_export_entity_pairs data=inst_w force; run;
proc append base=counts_export_entity_pairs data=inst_i force; run;
proc append base=counts_export_entity_pairs data=inst_w_prog force; run;
proc append base=counts_export_entity_pairs data=inst_i_prog force; run;

proc export data=counts_export_entity_meta outfile="&outputloc.\counts_export_entity_meta.csv" replace; run;
proc export data=counts_export_entity_pairs outfile="&outputloc.\counts_export_entity_pairs.csv" replace; run;

/*** 5. Person level - MIN(rel) any-overlap-wins collapse per (pid, wid, collaborator),
   then per (pid, wid): count of distinct collaborators per relationship bucket. A
   person qualifies for Department mode if ANY of their own rows has UnitType in
   (Department,Medical,Clinical); Program mode similarly - independent of which
   bucket a given collaborator relationship falls into. ***/

proc sql;
	create table person_rel_raw as
	select distinct PersonId_c as pid, Collab_ID_c as wid, Collab_PersonID_c as cpid,
		case
			when Collab_Dir = 'External' then 2
			when Relationship = 'Within Unit' then 0
			when Relationship = 'Across Units' then 1
			else 2
		end as relcode
	from details0;
quit;
proc sql;
	create table person_rel_min as
	select pid, wid, cpid, min(relcode) as relcode
	from person_rel_raw
	group by pid, wid, cpid;
quit;
proc sql;
	create table person_pairs_raw as
	select pid, wid, relcode, count(distinct cpid) as pairs
	from person_rel_min
	group by pid, wid, relcode;
quit;

proc sql;
	create table person_kind_dept as
	select distinct PersonId_c as pid from details0
	where UnitType in ('Department','Medical','Clinical');
quit;
proc sql;
	create table person_kind_prog as
	select distinct PersonId_c as pid from details0
	where UnitType in ('Program','Medical','Clinical');
quit;

proc sql;
	create table person_name as
	select PersonId_c as pid, min(PersonName) as label length=100
	from details0 group by pid;
quit;
proc sql;
	create table person_rank as
	select PersonId_c as pid, min(Rank) as rank length=60
	from details0 where Rank is not missing group by pid;
quit;

%macro export_person(unit_kind=, kindtable=, typefilter=);

	proc sql;
		create table person_meta_&unit_kind. as
		select "&unit_kind." as unit_kind length=12, k.pid as id length=20,
			coalesce(n.label,k.pid) as label length=100, r.rank
		from &kindtable. k
		left join person_name n on k.pid = n.pid
		left join person_rank r on k.pid = r.pid;
	quit;
	proc append base=counts_export_person_meta data=person_meta_&unit_kind. force; run;

	proc sql;
		create table person_disc_&unit_kind. as
		select distinct "&unit_kind." as unit_kind length=12, PersonId_c as pid length=20, Discipline as discipline
		from details0
		where UnitType in &typefilter. and Discipline is not missing
		and PersonId_c in (select pid from &kindtable.);
	quit;
	proc append base=counts_export_person_disc data=person_disc_&unit_kind. force; run;

	proc sql;
		create table person_pairs_&unit_kind. as
		select "&unit_kind." as unit_kind length=12, p.pid as id length=20,
			case p.relcode when 0 then 'within' when 1 then 'across' else 'inter' end as category length=8,
			p.wid, p.pairs
		from person_pairs_raw p
		where p.pid in (select pid from &kindtable.);
	quit;
	proc append base=counts_export_person_pairs data=person_pairs_&unit_kind. force; run;

%mend;

proc datasets lib=work nolist;
	delete counts_export_person_meta counts_export_person_disc counts_export_person_pairs;
run; quit;

%export_person(unit_kind=Department, kindtable=person_kind_dept, typefilter=('Department','Medical','Clinical'));
%export_person(unit_kind=Program,    kindtable=person_kind_prog, typefilter=('Program','Medical','Clinical'));

proc export data=counts_export_person_meta outfile="&outputloc.\counts_export_person_meta.csv" replace; run;
proc export data=counts_export_person_disc outfile="&outputloc.\counts_export_person_disc.csv" replace; run;
proc export data=counts_export_person_pairs outfile="&outputloc.\counts_export_person_pairs.csv" replace; run;

/*** 6. Write counts_simple_v3.json DIRECTLY (no downstream Python reshape needed -
   this section does the full CSV-to-nested-JSON pivot in SAS itself, so the whole
   pipeline - counting AND export - is real SAS end to end). Streams tokens straight
   to the file rather than building one big string per array, because some arrays
   are large (institution-level "inter" has 14,646 entries) and SAS character
   variables cap out at 32,767 bytes - concatenating a whole array into one variable
   would silently truncate. Every entity object always gets all 3 keys
   (within/across/inter), even as empty arrays, so the client JS's
   `for (const e of list)` loops never hit a missing/undefined key.

   NOT independently tested against a live SAS session (none available where this
   was written) - the logic was reasoned through carefully (see comments below on
   the trickier parts: JSON string escaping, avoiding fixed-width blank padding
   leaking into string values, and the always-3-keys guarantee), but please
   validate the output (e.g. paste into a JSON validator, or send it back and it
   can be checked with Python's json.load) before trusting it blindly. ***/

proc fcmp outlib=work.funcs.funcs;
	function jsonesc(s) $ 4000;
		length out $ 4000;
		out = tranwrd(s, '\', '\\');
		out = tranwrd(out, '"', '\"');
		out = tranwrd(out, byte(10), ' ');
		out = tranwrd(out, byte(13), ' ');
		return(strip(out));
	endsub;  /* PROC FCMP terminates FUNCTION blocks with ENDSUB, not a typo */
run;
options cmplib=work.funcs;

filename jsonout "&outputloc.\counts_simple_v3.json";

/* assign a compact 0-based work index + type index (a JS-array-size convenience,
   not a counting decision - the actual within/across/inter/nAuthors/interdisc
   numbers were all already computed above in section 2-5) */
proc sort data=counts_export_work_meta out=work_meta_sorted; by wid; run;
data work_index;
	set work_meta_sorted;
	work_idx = _n_ - 1;
run;
proc sql;
	create table types_list as select distinct work_type from work_index order by work_type;
quit;
data types_list;
	set types_list;
	type_idx = _n_ - 1;
run;
proc sql;
	create table work_index2 as
	select w.wid, w.work_idx, w.nAuthors, w.interdisc, t.type_idx
	from work_index w left join types_list t on w.work_type = t.work_type
	order by w.work_idx;
quit;

/* wid -> work_idx lookup applied to the pairs tables up front */
proc sql;
	create table entity_pairs_idx as
	select p.unit_kind, p.level, p.id, p.category, w.work_idx, p.pairs
	from counts_export_entity_pairs p
	inner join work_index2 w on p.wid = w.wid;
quit;
proc sort data=entity_pairs_idx; by unit_kind level id category work_idx; run;
proc sort data=counts_export_entity_meta out=entity_meta_sorted; by unit_kind level id; run;

proc sql;
	create table person_pairs_idx as
	select p.unit_kind, p.id, p.category, w.work_idx, p.pairs
	from counts_export_person_pairs p
	inner join work_index2 w on p.wid = w.wid;
quit;
proc sort data=person_pairs_idx; by unit_kind id category work_idx; run;

proc sort data=counts_export_person_disc out=person_disc_sorted; by unit_kind pid discipline; run;
data person_disc_joined;
	length disc_joined $ 1000;
	retain disc_joined '';
	set person_disc_sorted;
	by unit_kind pid;
	if first.pid then disc_joined = '';
	if disc_joined = '' then disc_joined = strip(discipline);
	else disc_joined = strip(disc_joined) || ' | ' || strip(discipline);
	if last.pid then output;
	keep unit_kind pid disc_joined;
run;

proc sql;
	create table person_meta_full as
	select m.unit_kind, "person" as level length=12, m.id, m.label, m.rank, d.disc_joined
	from counts_export_person_meta m
	left join person_disc_joined d on m.unit_kind = d.unit_kind and m.id = d.pid
	order by m.unit_kind, m.id;
quit;
proc sql;
	create table person_pairs_idx2 as
	select unit_kind, "person" as level length=12, id, category, work_idx, pairs
	from person_pairs_idx;
quit;
proc sort data=person_pairs_idx2; by unit_kind level id category work_idx; run;

/* ---- write the file ---- */
data _null_; file jsonout; put '{'; run;

data _null_;
	file jsonout mod;
	set types_list end=eof;
	if _n_=1 then put '"types":[' @;
	else put ',' @;
	put '"' @; put strip(jsonesc(strip(work_type))) @; put '"' @;
	if eof then put '],';
run;

data _null_;
	file jsonout mod;
	set work_index2 end=eof;
	if _n_=1 then put '"typeIdx":[' @;
	else put ',' @;
	put strip(put(type_idx,32.)) @;
	if eof then put '],';
run;

data _null_;
	file jsonout mod;
	set work_index2 end=eof;
	if _n_=1 then put '"nAuthors":[' @;
	else put ',' @;
	put strip(put(nAuthors,32.)) @;
	if eof then put '],';
run;

data _null_;
	file jsonout mod;
	set work_index2 end=eof;
	if _n_=1 then put '"interdisc":[' @;
	else put ',' @;
	put strip(put(interdisc,32.)) @;
	if eof then put '],';
run;

/* emits one {"Department":[...],"Program":[...]} block for a given (parent_key, level) */
%macro emit_group(parent_key=, level=, meta=, pairs=, idcol=, has_rank_disc=0);
	data _null_; file jsonout mod; put '"' "&parent_key." '":{'; run;

	%do ki = 1 %to 2;
		%let uk = %scan(Department Program, &ki., %str( ));

		data _null_; file jsonout mod; put '"' "&uk." '":['; run;

		data _null_;
			file jsonout mod;
			merge &meta.(in=inmeta where=(unit_kind="&uk." and level="&level."))
			      &pairs.(in=inpairs where=(unit_kind="&uk." and level="&level."));
			by unit_kind &idcol.;
			retain wrote_within wrote_across wrote_inter 0 prev_category '' in_cat_open 0 n_obj 0;
			length labelesc rankesc discesc $ 500;

			if first.&idcol. then do;
				n_obj + 1;
				if n_obj > 1 then put ',' @;
				labelesc = jsonesc(strip(label));
				put '{"id":"' @; put strip(&idcol.) @; put '","label":"' @; put strip(labelesc) @; put '"' @;
				%if &has_rank_disc. %then %do;
					if missing(rank) then put ',"rank":null' @;
					else do; rankesc = jsonesc(strip(rank)); put ',"rank":"' @; put strip(rankesc) @; put '"' @; end;
					if missing(disc_joined) then put ',"disc":null' @;
					else do; discesc = jsonesc(strip(disc_joined)); put ',"disc":"' @; put strip(discesc) @; put '"' @; end;
				%end;
				%else %do;
					put ',"rank":null,"disc":null' @;
				%end;
				wrote_within = 0; wrote_across = 0; wrote_inter = 0;
				prev_category = ''; in_cat_open = 0;
			end;

			if inpairs then do;
				if category ne prev_category then do;
					if in_cat_open then put ']' @;
					put ',"' @; put strip(category) @; put '":[' @;
					in_cat_open = 1; prev_category = category;
					if category='within' then wrote_within=1;
					else if category='across' then wrote_across=1;
					else if category='inter' then wrote_inter=1;
				end;
				else put ',' @;
				put '[' @; put strip(put(work_idx,32.)) @; put ',' @; put strip(put(pairs,32.)) @; put ']' @;
			end;

			if last.&idcol. then do;
				if in_cat_open then do; put ']' @; in_cat_open=0; end;
				if not wrote_within then put ',"within":[]' @;
				if not wrote_across then put ',"across":[]' @;
				if not wrote_inter then put ',"inter":[]' @;
				put '}' @;
			end;
		run;

		data _null_;
			file jsonout mod;
			%if &ki.=1 %then %do; put '],'; %end;
			%else %do; put ']'; %end;
		run;
	%end;

	data _null_; file jsonout mod; put '},'; run;
%mend;

%emit_group(parent_key=department, level=department, meta=entity_meta_sorted, pairs=entity_pairs_idx, idcol=id, has_rank_disc=0);
%emit_group(parent_key=college,    level=college,    meta=entity_meta_sorted, pairs=entity_pairs_idx, idcol=id, has_rank_disc=0);
%emit_group(parent_key=institution,level=institution,meta=entity_meta_sorted, pairs=entity_pairs_idx, idcol=id, has_rank_disc=0);
%emit_group(parent_key=person,     level=person,     meta=person_meta_full,   pairs=person_pairs_idx2, idcol=id, has_rank_disc=1);

/* the macro leaves a trailing comma after the last "person" block above - strip it
   by writing the closing brace on its own line; JSON tolerates the extra
   whitespace/newlines this whole script produces throughout, but NOT a trailing
   comma before a closing brace, so this fixes the one spot it would otherwise occur */
data _null_;
	file jsonout mod;
	put '"__end__":0}';
run;

proc printto; run;  *restore normal log output;

/*** 7. Physics (8950) spot-check - expect within=948, across=192 (distinct-works
   oracle), matching DECISIONS.md and the already-validated network_viz.html figures.
   Also: after running, sanity-check counts_simple_v3.json parses (e.g.
   `python3 -c "import json;json.load(open('counts_simple_v3.json'))"` or any JSON
   validator) before handing it back - see the caveat at the top of section 6. ***/
title "Physics (8950) department-level spot-check (expect within=948, across=192)";
proc sql;
	select category, count(distinct wid) as works, sum(pairs) as collabs
	from counts_export_entity_pairs
	where unit_kind="Department" and level="department" and id="8950"
	group by category;
quit;
title;

title "MIT institution row (expect within~4920, all_works~16747)";
proc sql;
	select category, count(distinct wid) as works, sum(pairs) as collabs
	from counts_export_entity_pairs
	where level="institution" and unit_kind="Department"
	group by category;
quit;
title;
