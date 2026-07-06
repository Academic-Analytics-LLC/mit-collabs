/**********************************************************************************
 Unit tests: details_base.csv (our SAS Details extract) vs portal_oracle
 (36 department folders, each with within_unit.csv / across_units.csv downloaded
 straight from the AA portal), plus the two full-census bulk institution-wide
 downloads.

 Oracle department files are PAIR-grain: one row per (unit scholar, collaborator)
 with a count column per work type (Co-Authored Articles/Books/Chapters/Conference
 Proceedings/Grants/Patents/Trials).

 details_base.csv is maximally exploded (duplicated across UnitType/College/
 Discipline on both sides), so before comparing we collapse it back down to the
 SAME grain the oracle uses:
   1. Keep only rows where the FOCAL side's UnitType is Department/Medical/
      Clinical (matches the Department-mode + always-include-medical baseline
      the Physics oracle numbers were originally validated against).
   2. Dedupe to (UnitId, Relationship, PersonId, Collab_PersonID,
      CollaborationType, Collab_ID) - this collapses the explosion back to
      "this pair produced this work of this type," independent of which
      college/discipline/unit-membership row we're looking at.
   3. Pivot to one row per (UnitId, Relationship, PersonId, Collab_PersonID)
      with a count column per type, matching the oracle's wide layout.
   4. Full-join to the oracle pairs and diff every count column.

 Update &oracleloc. / &detailsloc. below, then run. Output:
   - unit_test_mismatches.csv   -> every (dept, scope, pair, type) cell that
                                    doesn't match, for manual review
   - unit_test_summary.csv      -> pass/fail counts rolled up by dept + scope
   - bulk_mismatches_dept.csv / bulk_mismatches_prog.csv -> full-census diffs
 in the log: a printed summary table + the Physics (8950) spot-check.

 FIXES vs the first version (both confirmed from an actual run's log):
   1. "Co-Authored Conference Proceedings" (34 chars) exceeds SAS's 32-char
      variable name limit NO MATTER HOW it's referenced - the 'name'n literal
      trick only fixes invalid CHARACTERS (spaces/hyphens), not length. Fixed
      by importing with GETNAMES=NO + DATAROW=2 and renaming columns by
      POSITION (VAR1, VAR2, ...) instead of by their original header text.
   2. STRIP() failing on Collab_ID/PersonId/Collab_PersonID in the bulk-check
      query even though the SAME columns worked fine via STRIP() earlier in
      the SAME run - PROC IMPORT's automatic type-guessing on details_base.csv
      is not fully reliable for columns with mixed numeric/text-like content
      (Collab_ID holds DOIs, ISBNs, grant ids, patent numbers - all different
      shapes). Fixed by switching every STRIP(x) / STRIP(PUT(x,best12.)) to
      CATS(x), which accepts both character and numeric input and normalizes
      to character either way - no need to know or guess the type.
**********************************************************************************/

%let oracleloc  = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\portal_oracle;
%let detailsloc = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\sas\details_base.csv;
%let outputloc  = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\sas;

*If a per-department error starts repeating in the log window and scrolls too fast to
 copy, don't try to read it live - open the redirected log file below afterward and
 send me just the FIRST occurrence of the error (everything after that is a repeat);
proc printto log="&outputloc.\details_unit_tests.log" new; run;

/*** 1. Control table: the 36 oracle department folders (folder name = Label_UnitId) ***/
data depts;
	length folder $60 unitid $10;
	input folder $60.;
	unitid = scan(folder, -1, '_');
	datalines;
AeroAstro_8926
Anthropology_16113
AppliedOceanPhysics_33840
Architecture_8927
BioEng_8928
BiologyWHOI_33841
Biology_8929
BrainCogSci_8930
ChemE_8931
Chemistry_8932
CivilEnv_8933
ComparativeMediaStudiesWriting_16128
EAPS_8935
EECS_8937
Economics_8936
GeologyGeophysics_33842
GlobalStudiesLanguages_16105
History_16114
IDSS_8938
IMES_33503
LinguisticsPhilosophy_8940
LiteratureSection_16127
ManagementSloan_8941
MarineChemGeochem_33836
MarinePolicyCenter_35313
MaterialsScienceEngineering_8942
Mathematics_8943
MechanicalEngineering_8944
MediaArtsSciences_8945
MusicTheaterArts_33369
NuclearScienceEngineering_8946
PhysicalOceanography_33843
Physics_8950
PoliticalScience_8951
ScienceTechnologySociety_8953
UrbanStudiesPlanning_8954
;
run;

/*** 2. Import every folder's within_unit.csv + across_units.csv, tag UnitId/Scope/
   dept label, and stack into one oracle_pairs dataset.

   GETNAMES=NO + DATAROW=2 so SAS never tries to turn the header row into
   variable names at all (sidesteps the 32-char limit entirely) - columns
   come in as VAR1, VAR2, ... in file order, which is verified identical
   across all 36 folders:
     within_unit.csv:  1 Unit, 2 Unit Scholar, 3 Unit Scholar ID,
                        4 Collab Scholar, 5 Collab Scholar ID,
                        6 Articles, 7 Books, 8 Chapters, 9 ConfProc,
                        10 Grants, 11 Patents, 12 Trials
     across_units.csv: 1 Unit, 2 Unit Scholar, 3 Unit Scholar ID,
                        4 Collab Unit, 5 Collab Scholar, 6 Collab Scholar ID,
                        7 Articles, 8 Books, 9 Chapters, 10 ConfProc,
                        11 Grants, 12 Patents, 13 Trials
***/
%macro import_oracle(folder=, unitid=);
	proc import datafile="&oracleloc.\&folder.\within_unit.csv"
		out=_w replace dbms=csv; guessingrows=100000; getnames=no; datarow=2;
	run;
	data _w2;
		length UnitId $10 Scope $20 Dept $60;
		set _w(rename=(
			VAR3=Unit_Scholar_ID   VAR5=Collab_Scholar_ID
			VAR6=Co_Authored_Articles VAR7=Co_Authored_Books VAR8=Co_Authored_Chapters
			VAR9=Co_Authored_ConfProc VAR10=Co_Authored_Grants
			VAR11=Co_Authored_Patents VAR12=Co_Authored_Trials
		));
		UnitId = "&unitid.";
		Dept = "&folder.";
		Scope = "Within Unit";
		Unit_Scholar_ID_c  = cats(Unit_Scholar_ID);
		Collab_Scholar_ID_c = cats(Collab_Scholar_ID);
		keep UnitId Dept Scope Unit_Scholar_ID_c Collab_Scholar_ID_c
			Co_Authored_Articles Co_Authored_Books Co_Authored_Chapters
			Co_Authored_ConfProc Co_Authored_Grants
			Co_Authored_Patents Co_Authored_Trials;
	run;

	proc import datafile="&oracleloc.\&folder.\across_units.csv"
		out=_a replace dbms=csv; guessingrows=100000; getnames=no; datarow=2;
	run;
	data _a2;
		length UnitId $10 Scope $20 Dept $60;
		set _a(rename=(
			VAR3=Unit_Scholar_ID   VAR6=Collab_Scholar_ID
			VAR7=Co_Authored_Articles VAR8=Co_Authored_Books VAR9=Co_Authored_Chapters
			VAR10=Co_Authored_ConfProc VAR11=Co_Authored_Grants
			VAR12=Co_Authored_Patents VAR13=Co_Authored_Trials
		));
		UnitId = "&unitid.";
		Dept = "&folder.";
		Scope = "Across Units";
		Unit_Scholar_ID_c  = cats(Unit_Scholar_ID);
		Collab_Scholar_ID_c = cats(Collab_Scholar_ID);
		keep UnitId Dept Scope Unit_Scholar_ID_c Collab_Scholar_ID_c
			Co_Authored_Articles Co_Authored_Books Co_Authored_Chapters
			Co_Authored_ConfProc Co_Authored_Grants
			Co_Authored_Patents Co_Authored_Trials;
	run;

	proc append base=oracle_pairs data=_w2 force; run;
	proc append base=oracle_pairs data=_a2 force; run;
%mend;

data _null_;
	length call_txt $200;
	set depts;
	call_txt = '%import_oracle(folder=' || strip(folder) || ', unitid=' || strip(unitid) || ')';
	call execute(call_txt);
run;

/*** 3. Import our details_base.csv, restrict to Department-mode baseline,
   collapse the explosion, and pivot to the oracle's wide per-type layout.

   GUESSINGROWS must scan enough rows to see a real 'Department' value - the file's
   first block of rows happens to be Medical/Program-heavy, so guessingrows=1000
   silently truncated UnitType's informat to $7 (max length seen in that window),
   which made the literal 'Department' (10 chars) IMPOSSIBLE to match - SAS quietly
   rewrote the WHERE clause to WHERE UnitType='Medical' only, with zero errors/notes
   pointing at it. Confirmed via the log: "informat UnitType $7." + "WHERE
   UnitType='Medical'" printed under the data step. Fix: scan the whole file (fast -
   ~19s for 2.8M rows) so the guessed length matches the true max ('Department'=10). ***/
proc import datafile="&detailsloc."
	out=details replace dbms=csv; guessingrows=3000000; getnames=yes;
run;

*Log the actual imported column types once, for debugging if anything downstream
 still complains about a type mismatch;
proc contents data=details varnum; run;

data details_dept;
	set details;
	where UnitType in ('Department','Medical','Clinical');
	PersonId_c = cats(PersonId);
	Collab_PersonID_c = cats(Collab_PersonID);
	Collab_ID_c = cats(Collab_ID);
run;

proc sort data=details_dept out=details_dedup nodupkey;
	by UnitId Relationship PersonId_c Collab_PersonID_c CollaborationType Collab_ID_c;
run;

proc sql;
	create table our_pairs as
	select
		cats(UnitId) as UnitId length=10,
		Relationship as Scope length=20,
		PersonId_c as Unit_Scholar_ID_c length=20,
		Collab_PersonID_c as Collab_Scholar_ID_c length=20,
		count(distinct case when CollaborationType='Article' then Collab_ID_c end) as Co_Authored_Articles,
		count(distinct case when CollaborationType='Book' then Collab_ID_c end) as Co_Authored_Books,
		count(distinct case when CollaborationType='Book Chapter' then Collab_ID_c end) as Co_Authored_Chapters,
		count(distinct case when CollaborationType='Conference Proceeding' then Collab_ID_c end) as Co_Authored_ConfProc,
		count(distinct case when CollaborationType='Federal Grant' then Collab_ID_c end) as Co_Authored_Grants,
		count(distinct case when CollaborationType='Patent' then Collab_ID_c end) as Co_Authored_Patents,
		count(distinct case when CollaborationType='Clinical Trial' then Collab_ID_c end) as Co_Authored_Trials
	from details_dedup
	where Relationship in ('Within Unit','Across Units')
	group by UnitId, Relationship, PersonId_c, Collab_PersonID_c
	;
quit;

/*** 4. Full-join oracle vs ours, diff every count column, flag mismatches. ***/
proc sql;
	create table compare as
	select
		coalesce(o.UnitId, w.UnitId) as UnitId,
		coalesce(o.Dept, '') as Dept,
		coalesce(o.Scope, w.Scope) as Scope,
		coalesce(o.Unit_Scholar_ID_c, w.Unit_Scholar_ID_c) as Unit_Scholar_ID,
		coalesce(o.Collab_Scholar_ID_c, w.Collab_Scholar_ID_c) as Collab_Scholar_ID,
		coalesce(o.Co_Authored_Articles,0) as oracle_articles, coalesce(w.Co_Authored_Articles,0) as our_articles,
		coalesce(o.Co_Authored_Books,0) as oracle_books, coalesce(w.Co_Authored_Books,0) as our_books,
		coalesce(o.Co_Authored_Chapters,0) as oracle_chapters, coalesce(w.Co_Authored_Chapters,0) as our_chapters,
		coalesce(o.Co_Authored_ConfProc,0) as oracle_confproc, coalesce(w.Co_Authored_ConfProc,0) as our_confproc,
		coalesce(o.Co_Authored_Grants,0) as oracle_grants, coalesce(w.Co_Authored_Grants,0) as our_grants,
		coalesce(o.Co_Authored_Patents,0) as oracle_patents, coalesce(w.Co_Authored_Patents,0) as our_patents,
		coalesce(o.Co_Authored_Trials,0) as oracle_trials, coalesce(w.Co_Authored_Trials,0) as our_trials,
		(missing(o.UnitId)) as missing_in_oracle,
		(missing(w.UnitId)) as missing_in_ours
	from oracle_pairs o
	full join our_pairs w
		on o.UnitId = w.UnitId and o.Scope = w.Scope
		and o.Unit_Scholar_ID_c = w.Unit_Scholar_ID_c and o.Collab_Scholar_ID_c = w.Collab_Scholar_ID_c
	;
quit;

data compare2;
	set compare;
	mismatch = (oracle_articles ne our_articles) or (oracle_books ne our_books)
		or (oracle_chapters ne our_chapters) or (oracle_confproc ne our_confproc)
		or (oracle_grants ne our_grants) or (oracle_patents ne our_patents)
		or (oracle_trials ne our_trials) or missing_in_oracle or missing_in_ours;
run;

/*** 5. Summaries ***/
proc sql;
	create table summary as
	select Dept, UnitId, Scope,
		count(*) as pairs_checked,
		sum(mismatch) as pairs_mismatched,
		sum(missing_in_oracle) as pairs_missing_in_oracle,
		sum(missing_in_ours) as pairs_missing_in_ours
	from compare2
	group by Dept, UnitId, Scope
	order by Dept, Scope
	;
quit;

title "Details unit test summary - mismatches by department + scope";
proc print data=summary noobs; run;
title;

proc sql;
	select sum(pairs_checked) as total_pairs, sum(pairs_mismatched) as total_mismatched,
		sum(pairs_missing_in_oracle) as total_missing_in_oracle, sum(pairs_missing_in_ours) as total_missing_in_ours
	from summary;
quit;

*Physics spot check - distinct work totals;
proc sql;
	create table physics_distinct as
	select Relationship as Scope, count(distinct Collab_ID_c) as distinct_works
	from details_dedup
	where UnitId = 8950 and Relationship in ('Within Unit','Across Units')
	group by Relationship
	;
quit;

title "Physics (8950) distinct-work spot check - expect Within Unit ~948";
proc print data=physics_distinct noobs; run;
title;

*Export mismatch detail + summary for review outside SAS;
proc export data=compare2(where=(mismatch=1))
	outfile="&outputloc.\unit_test_mismatches.csv" replace; run;
proc export data=summary
	outfile="&outputloc.\unit_test_summary.csv" replace; run;


/**********************************************************************************
 6. BULK INSTITUTION-WIDE CROSS-CHECK (the two full-census downloads)
   collaborations_department_view.csv / collaborations_program_view.csv are
   FULL-CENSUS, WORK-GRAIN, ordered-pair (both directions), MIT-internal-only,
   Article + Conference Proceeding only. That grain matches details_base.csv
   almost exactly (no collapsing needed beyond the UnitType filter + explosion
   dedupe), so this is a stronger check than the per-department sampled files:
   every internal article/confproc collaboration at MIT, not just 36 anchors.

   department_view -> compare against UnitType='Department' on BOTH sides.
   program_view    -> compare against UnitType='Program' on BOTH sides.
**********************************************************************************/
%let bulkloc = &oracleloc.\_bulk_institution_wide;
*Article/ConfProc product window (must match the &fouryear. window in the extract -
 the bulk downloads are NOT pre-windowed, they're a live/full-history pull, so without
 this filter the oracle side includes decades of pre-window articles the extract
 correctly excludes, making the comparison look like a massive false mismatch;
%let yr_lo = 2021;
%let yr_hi = 2024;

%macro bulk_check(file=, unitkind=, label=);

	proc import datafile="&bulkloc.\&file."
		out=_bulk replace dbms=csv; guessingrows=100000; getnames=yes;
	run;

	data bulk_&label.;
		set _bulk;
		where pubyear between &yr_lo. and &yr_hi.;
		length CollaborationType $25;
		if isconfproc = 1 then CollaborationType = 'Conference Proceeding';
		else CollaborationType = 'Article';
		doi_c = cats(doi);
		AAUID_c = cats(AAUID);
		unitid_c = cats(unitid);
		collaboratorpersonid_c = cats(collaboratorpersonid);
		collaboratorunitid_c = cats(collaboratorunitid);
	run;

	proc sql;
		create table oracle_bulk_&label. as
		select distinct doi_c, AAUID_c, unitid_c, collaboratorpersonid_c, collaboratorunitid_c, CollaborationType
		from bulk_&label.;
	quit;

	*our side: both focal AND collaborator UnitType must match the requested unitkind,
	 internal-only, Article/ConfProc only, then dedupe the explosion away;
	proc sql;
		create table our_bulk_&label. as
		select distinct
			cats(Collab_ID) as doi_c,
			cats(PersonId) as AAUID_c,
			cats(UnitId) as unitid_c,
			cats(Collab_PersonID) as collaboratorpersonid_c,
			cats(Collab_UnitId) as collaboratorunitid_c,
			CollaborationType
		from details
		where UnitType = "&unitkind." and Collab_UnitType = "&unitkind."
			and Collab_Dir = 'Internal'
			and CollaborationType in ('Article','Conference Proceeding')
		;
	quit;

	proc sql;
		create table bulk_compare_&label. as
		select
			coalesce(o.doi_c, w.doi_c) as doi,
			coalesce(o.AAUID_c, w.AAUID_c) as AAUID,
			coalesce(o.unitid_c, w.unitid_c) as unitid,
			coalesce(o.collaboratorpersonid_c, w.collaboratorpersonid_c) as collaboratorpersonid,
			coalesce(o.collaboratorunitid_c, w.collaboratorunitid_c) as collaboratorunitid,
			coalesce(o.CollaborationType, w.CollaborationType) as CollaborationType,
			(missing(o.doi_c)) as missing_in_oracle,
			(missing(w.doi_c)) as missing_in_ours
		from oracle_bulk_&label. o
		full join our_bulk_&label. w
			on o.doi_c = w.doi_c and o.AAUID_c = w.AAUID_c and o.unitid_c = w.unitid_c
			and o.collaboratorpersonid_c = w.collaboratorpersonid_c and o.collaboratorunitid_c = w.collaboratorunitid_c
		;
	quit;

	proc sql;
		select
			(select count(*) from oracle_bulk_&label.) as oracle_rows,
			(select count(*) from our_bulk_&label.) as our_rows,
			sum(missing_in_oracle) as extra_in_ours,
			sum(missing_in_ours) as missing_from_ours,
			count(*) - sum(missing_in_oracle) - sum(missing_in_ours) as matched
		from bulk_compare_&label.
		;
	quit;

	proc export data=bulk_compare_&label.(where=(missing_in_oracle=1 or missing_in_ours=1))
		outfile="&outputloc.\bulk_mismatches_&label..csv" replace; run;

%mend;

title "Bulk cross-check: Department view (full MIT census, Article+ConfProc, internal-only)";
%bulk_check(file=collaborations_department_view.csv, unitkind=Department, label=dept);
title;

title "Bulk cross-check: Program view (full MIT census, Article+ConfProc, internal-only)";
%bulk_check(file=collaborations_program_view.csv, unitkind=Program, label=prog);
title;

proc printto; run;  *restore normal log output - open details_unit_tests.log above to review;
