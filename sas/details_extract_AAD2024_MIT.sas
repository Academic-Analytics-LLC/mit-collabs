/**********************************************************************************
 Details Report Extract - AAD2024 - MIT (institutionid 123)
 ---------------------------------------------------------------------------------
 Produces ONE flat, work-grain, both-sides-exploded base dataset for the
 "Details" page of the v2 Collaboration Network tool. This is a NEW, separate
 extract from MITCollasAAD2024.sas (which still produces the original
 collabs.csv for whatever else depends on its current shape) - it reuses the
 same proven join logic for the 7 collaboration types, but changes three things
 based on the design discussion:

   1. UnitType is tagged directly in the union (Department / Program / Medical /
      Clinical), on BOTH the focal and collaborator side, so the client can
      toggle Department-vs-Program and Include-Medical without a new SAS run.
      (Medical/Clinical rows are always present in the base file; the toggle
      is a client-side filter, same as Department/Program.)

   2. Discipline is NOT pre-concatenated into a single "|"-joined string per
      person (the old "Cat" field). It's carried per-row, tied to whichever
      unit membership produced it, so a multi-discipline person naturally
      fans out into multiple rows - same mechanism that already makes a
      multi-department person fan out today. Client-side "concatenate"
      toggles re-join these rows for display; SAS does not collapse them.

   3. Grain is WORK-GRAIN, one row per (scholar, work, collaborator) - no
      pair-grain aggregation, no per-type count columns. Both sides'
      Department/Program, College, and Discipline are exploded (cross-product)
      per the "both sides" decision. A Relationship column (Within Unit /
      Across Units / Across Institutions) is computed here in SAS, not left
      to Python/JS, per the project's "all analytics in SAS" rule.

 IMPORTANT: I (Claude) cannot run SAS. Please run this and check the log before
 trusting the output - flag any errors/warnings and I'll fix them. Once it
 runs clean, we'll validate distinct-row and distinct-work counts against the
 portal_oracle files (e.g. Physics unit 8950) before building the HTML page.
**********************************************************************************/

***UPDATE output location + institution;
%let outputloc = C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\collab-mit\sas;
%let institutionname = 'Massachusetts Institute of Technology';
%let institutionid = 123;

*UPDATE release locations and names;
libname sasdata odbc dsn='analysis1' schema=dbo qualifier = 'AAD2024-2904';
%let release = AAD2024-2904;

libname adb odbc dsn='analysis1' schema=dbo qualifier = 'AnalysisDB';
libname tab odbc dsn='analysis1' schema=dbo qualifier = 'AATableau';

***UPDATE macros (AAD2024 product windows) - same windows as the main extract;
%let fouryear  = (2021:2024);   /* articles, conf proc, book chapters */
%let tenyear   = (2015:2024);   /* books */
%let fiveyear  = (2020:2024);
%let grantstart = 2020;
%let grantend   = 2024;

***inst attributes for state;
data AllInst; set sasdata.aa_c_institution; run;

***college/department structure for the focal institution (unchanged from main extract);
proc sql;
	create table collegedept as
	select distinct a.institutionid, a.unitregistryid, a.unitid, a.unitname,
		a.comparisongroupid, a.collegename as College length=300
	from sasdata.ts_CollegeStructure a
	where a.institutionid = &institutionid.
	union corr
	select distinct a.institutionid, a.unitregistryid, a.unitid, a.unitname,
		a.comparisongroupid, a.collegename as College length=300
	from tab.vw_ProgramCollegeStructure a
	where a.institutionid = &institutionid.
	union corr
	select distinct a.institutionid, a.unitregistryid, a.unitid, a.unitname,
		a.comparisongroupid, a.collegename as College length=300
	from sasdata.ts_CollegeStructure_med a
	where a.institutionid = &institutionid.
	;
quit;

proc sql;
	create table collegedept2 as
	select distinct institutionid, unitregistryid, unitid, unitname, comparisongroupid, College
	from collegedept
	;
quit;

/***CHANGED: f1 now tags UnitType per source table, so Department/Program/Medical/
   Clinical can be told apart downstream without a separate lookup join.***/
proc sql; create table f1 as
select distinct
	a.institutionid, a.institutionname,
	a.unitid, a.unitname, d.unitregistryid,
	a.comparisongroupid, a.comparisongroupname,
	c.College,
	a.personid, a.personname, a.ranktypeid, a.degreeyear,
	b.taxonomylevel03name,
	"Department" as UnitType length=10
from sasdata.aa_c_level01_dept_fac_comp a
	left join sasdata.aa_fd_department_taxonomy b
		on a.institutionid = b.institutionid and a.comparisongroupid = b.taxonomylevel01id
	left join sasdata.aa_fd_department d
		on a.institutionid = d.institutionid and a.unitid = d.unitid
	left join collegedept2 c
		on a.institutionid = c.institutionid and a.unitid = c.unitid and a.comparisongroupid = c.comparisongroupid
UNION
select distinct
	a.institutionid, a.institutionname,
	a.unitid, a.unitname, d.unitregistryid,
	a.comparisongroupid, a.comparisongroupname,
	c.College,
	a.personid, a.personname, a.ranktypeid, a.degreeyear,
	b.taxonomylevel03name,
	"Program" as UnitType length=10
from sasdata.aa_c_level01_prog_fac_comp a
	left join sasdata.aa_fd_program_taxonomy b
		on a.institutionid = b.institutionid and a.comparisongroupid = b.taxonomylevel01id
	left join sasdata.aa_fd_program d
		on a.institutionid = d.institutionid and a.unitid = d.unitid
	left join collegedept2 c
		on a.institutionid = c.institutionid and a.unitid = c.unitid and a.comparisongroupid = c.comparisongroupid
UNION
select distinct
	a.institutionid, a.institutionname,
	a.unitid, a.unitname, d.unitregistryid,
	a.comparisongroupid, a.comparisongroupname,
	c.College,
	a.personid, a.personname, a.ranktypeid, a.degreeyear,
	b.taxonomylevel03name,
	"Medical" as UnitType length=10
from sasdata.aa_c_level01_med_fac_comp a
	left join sasdata.aa_fd_medical_taxonomy b
		on a.institutionid = b.institutionid and a.comparisongroupid = b.taxonomylevel01id
	left join sasdata.aa_fd_medical d
		on a.institutionid = d.institutionid and a.unitid = d.unitid
	left join collegedept2 c
		on a.institutionid = c.institutionid and a.unitid = c.unitid and a.comparisongroupid = c.comparisongroupid
UNION
select distinct
	a.institutionid, a.institutionname,
	a.unitid, a.unitname, d.unitregistryid,
	a.comparisongroupid, a.comparisongroupname,
	c.College,
	a.personid, a.personname, a.ranktypeid, a.degreeyear,
	b.taxonomylevel03name,
	"Clinical" as UnitType length=10
from sasdata.aa_c_level01_clin_fac_comp a
	left join sasdata.aa_fd_clinical_taxonomy b
		on a.institutionid = b.institutionid and a.comparisongroupid = b.taxonomylevel01id
	left join sasdata.aa_fd_clinical d
		on a.institutionid = d.institutionid and a.unitid = d.unitid
	left join collegedept2 c
		on a.institutionid = c.institutionid and a.unitid = c.unitid and a.comparisongroupid = c.comparisongroupid
;quit;

***add state (unchanged);
proc sql; create table allfaculty as
select distinct a.*, b.stateabbr as state
from f1 a left join allinst b on a.institutionid = b.institutionid
order by a.personid
;quit;

/***UNCHANGED from main extract: clean up the discipline/comparisongroup naming
   (merges near-duplicate discipline cohorts into one readable label). We keep
   this cleanup but do NOT concatenate multiple disciplines per person below -
   this table stays at (person, unit, discipline) grain.***/
proc sql;
create table want1 as
select distinct
	institutionid, institutionname, state,
	College, unitid, unitname, unitregistryid, UnitType,
	taxonomylevel03name,
	case
		when comparisongroupid = 454 then 11   when comparisongroupid = 455 then 15
		when comparisongroupid = 456 then 16   when comparisongroupid = 457 then 17
		when comparisongroupid = 458 then 43   when comparisongroupid = 459 then 106
		when comparisongroupid = 460 then 111  when comparisongroupid = 461 then 156
		else comparisongroupid end as comparisongroupid,
	case
		when comparisongroupid in (11, 454) then 'Anthropology'
		when comparisongroupid in (15, 455) then 'Architecture'
		when comparisongroupid in (16, 456) then 'Architecture, Design, Planning, various'
		when comparisongroupid in (17, 457) then 'Area and Ethnic Studies, various'
		when comparisongroupid in (43, 458) then 'Communication and Communication Studies'
		when comparisongroupid in (106,459) then 'Linguistics'
		when comparisongroupid in (111, 460) then 'Mass Communications/Media Studies'
		when comparisongroupid in (156, 461) then 'Sociology'
		else comparisongroupname end as comparisongroupname,
	personid, personname, ranktypeid, degreeyear
from allfaculty
where comparisongroupname ne ''
;quit;

/***CHANGED: this is the key departure from the main extract. The original
   script builds "unique_discs" (distinct personid+discipline, dropping unit)
   then catx-concatenates into one "cat" string per person, and re-merges that
   single string back onto every row. We skip all of that - Discipline stays
   a per-row value straight from want1, at whatever (unit, discipline) grain
   the source table naturally gives us. No aggregation, no re-merge.***/
data want;
	set want1;
	rename comparisongroupname = Discipline;
	drop comparisongroupid degreeyear;
run;

/***SEPARATE ONLY IOF FACULTY LIST - unchanged in spirit, just carries the new
   UnitType/Discipline columns through automatically via *. ***/
data IOFfac;
	set want;
	if institutionid = &institutionid.;
run;

*****************************************************************;
/***ARTICLES AND CONF PROCS - REVERTED to CD-only (see note below)***/;
/***TRIED aa_fd_matches_articles UNION aa_cd_matches_articles (see git-style
   history in this comment) to pick up 158 articles missing from CD alone.
   That DID fix the bulk-census gap, but it broke the 36-department oracle
   comparison that was previously 71/72 exact matches: Physics within went
   from the long-validated 948 to 974 (+26), and 44 of 72 dept/scope combos
   started mismatching. So the two oracle sources disagree - the bulk census
   file wants the FD-only articles, but the per-department pair-count
   downloads (which reproduce the portal's own displayed numbers, our
   highest-confidence baseline throughout this whole project) do not.
   Reverted to CD-only since matching the validated department-level numbers
   takes priority over the bulk census. The ~4% "missing" gap in the bulk
   cross-check is now a KNOWN, accepted discrepancy - those articles appear
   to exist in AA's broader match set but aren't in the client-facing CD
   table the portal's per-department views draw from.***/
proc sql; create table articles1a as
select distinct a.personid, upper(b.doi) as doi2 length=200, b.journalid, b.year, b.isconfproc
from ioffac a join sasdata.aa_cd_matches_articles b on a.personid = b.personid
where year in &fouryear.
;quit;

data articles1b; set articles1a; if isexcludedperclient = . then isexcludedperclient = 0; run;

proc sql; create table articles as
select distinct a.*, b.doi2, b.journalid, b.year, b.isconfproc
from ioffac a left join articles1b b on a.personid = b.personid
;quit;

proc sql; create table articlesall_a as
select distinct upper(doi) as doi2 length=200, personid
from sasdata.aa_cd_matches_articles
where (personid in (select distinct personid from allfaculty))
;quit;

data articlesall; set articlesall_a; if isexcludedperclient = . then isexcludedperclient = 0; run;

proc sql; create table articlesjoin as
select distinct doi2, personid from articlesall b where doi2 in (select doi2 from articles);
quit;

proc sql; create table articles1a as
select a.*, b.personid as personid2
from articles a left join articlesjoin b on a.doi2 = b.doi2
where a.personid ne b.personid;
quit;

proc sql; create table articles1b1a as
select distinct a.*, b.JournalName
from articles1a a left join adb.vw_JournalNameMini b on a.journalid = b.journalid
;quit;

proc sql; create table articles1b1 as
select distinct a.*, b.ArticleTitle
from articles1b1a a left join adb.vw_ArticleExtensionMini b on a.doi2 = upcase(b.doi)
;quit;

data articles_final; set articles1b1; if isconfproc = 0; length Collab_ID $200; Collab_ID = DOI2; run;
data confproc_final; set articles1b1; if isconfproc = 1; length Collab_ID $200; Collab_ID = DOI2; run;

*****************************************************************;
/***BOOKS - UNCHANGED***/;
proc sql; create table bookssource1 as
select distinct * from sasdata.aa_fd_matches_books
where publishyear in &tenyear.
AND ((IsChapter IS NULL OR IsChapter = 0)) AND (IsDuplicate = 0 AND BookAuthorClassIsExcludedFromRol = 0 AND BookClassIsExcludedFromRollup = 0)
;quit;

data bookssource; set bookssource1; format AuthorClassExcluded 1.; AuthorClassExcluded = BookAuthorClassIsExcludedFromRol; run;

proc sql; create table books1 as
select distinct a.*, b.Publisher, b.publishyear, b.title, b.isbn13
from ioffac a join bookssource b on a.personid = b.personid
;quit;

proc sql; create table booksjoin as
select distinct Publisher, isbn13, personid from bookssource where isbn13 in (select isbn13 from books1);
quit;

proc sql; create table books1a as
select distinct a.*, b.personid as personid2
from books1 a left join booksjoin b on a.isbn13 = b.isbn13
where a.personid ne b.personid;
quit;

data books_final; set books1a; length Collab_ID $200; Collab_ID = ISBN13; run;

***Book Chapters - UNCHANGED***;
proc sql; create table booksChapsource as select distinct * from sasdata.aa_cd_matches_bookchapters ;quit;

proc sql; create table bookChaps1 as
select distinct a.*, b.publishyear, b.ChapterTitle, b.Title, b.chapterlistid
from ioffac a join booksChapsource b on a.personid = b.personid
;quit;

proc sql; create table bookChapsjoin as
select distinct Title, chapterlistid, personid, Publishyear from booksChapsource where chapterlistid in (select chapterlistid from bookChaps1);
quit;

proc sql; create table bookChaps1a as
select distinct a.*, b.personid as personid2
from bookChaps1 a left join bookChapsjoin b on a.chapterlistid = b.chapterlistid
where a.personid ne b.personid;
quit;

data bookChaps_final; set bookChaps1a; length Collab_ID $200; Collab_ID = ChapterListID; run;

*****************************************************************;
/***GRANTS (active within window; shows start year) - UNCHANGED***/;
proc sql;
	connect to odbc (noprompt = "server=analysis1;DRIVER=SQL Server;Trusted Connection=yes;");
	create table grantcollabs_source as
		select personid, grantid, granttype as agencycode, grantname, startdate, durationinyears, totaldollars
		from connection to odbc
		(select personid, grantid, granttype, grantname, startdate, durationinyears, totaldollars
		 from [&release.].[dbo].[aa_fd_matches_grants]
		 where ((GrantType NOT IN ('ACS','AHA','AHRC','BBSRC','EPSRC','ERC','ESRC','MRC','NERC','STFC','Wellcome')
				AND CountryCode='US' AND DollarsPerYear >= 10) AND (IsResearch = 1))
			and (StartDate IS NULL OR (EndDate IS NOT NULL AND NOT (YEAR(StartDate) > &grantend. OR YEAR(EndDate) < &grantstart.))
			OR (EndDate IS NULL AND YEAR(StartDate) BETWEEN &grantstart. AND &grantend.))
		union
		 select personid, grantid, agencycode, grantname, startdate, durationinyears, totaldollars
		 from [&release.].[dbo].[aa_fd_matches_grants_copi]
		 where ((AgencyCode NOT IN ('ACS','AHA','AHRC','BBSRC','EPSRC','ERC','ESRC','MRC','NERC','STFC','Wellcome')
				AND CountryCode='US' AND DollarsPerYear >= 10) AND (IsResearch = 1))
			and (StartDate IS NULL OR (EndDate IS NOT NULL AND NOT (YEAR(StartDate) > &grantend. OR YEAR(EndDate) < &grantstart.))
			OR (EndDate IS NULL AND YEAR(StartDate) BETWEEN &grantstart. AND &grantend.)) )
		;
quit;

proc sql; create table grants as
select distinct a.*, b.* from ioffac a join grantcollabs_source b on a.personid = b.personid ;quit;

proc sql; create table grantsjoin as
select distinct grantid, personid from grantcollabs_source b
where grantid in (select grantid from grants) and personid in (select distinct personid from allfaculty);
quit;

proc sql; create table grants1 as
select distinct a.*, b.personid as personid2
from grants a left join grantsjoin b on a.grantid = b.grantid
where a.personid ne b.personid;
quit;

proc sql; create table grants1a as
select *, input(put(datepart(startdate),year4.),4.) as year format=4. from grants1 ;quit;

data grants1a; set grants1a; format Year1 11.; Year1 = year; drop year; run;
data grants_final; set grants1a; length Collab_ID $200; Collab_ID = grantid; run;

*****************************************************************;
/***PATENTS - UNCHANGED***/;
proc sql; create table patents_source as
select distinct a.*, b.patentnumber, b.grantedyear, b.patenttype, b.patenttitle
from ioffac a join sasdata.aa_CD_matches_patents b on a.personid = b.personid;
quit;

proc sql; create table patentsjoin as
select distinct patentnumber, personid from sasdata.aa_fd_matches_patents a
where patentnumber in (select patentnumber from patents_source) and personid in (select distinct personid from allfaculty);
quit;

proc sql; create table patents1 as
select distinct a.*, b.personid as personid2
from patents_source a left join patentsjoin b on a.patentnumber = b.patentnumber
where a.personid ne personid2;
quit;

data patents_final; set patents1; length Collab_ID $200; Collab_ID = PatentNumber; run;

*****************************************************************;
/***TRIALS - UNCHANGED***/;
proc sql; create table trials_source as
select distinct a.*, b.NCT_ID, b.Brieftitle, b.startdate, b.enddate
from ioffac a join sasdata.aa_cd_matches_trials b on a.personid = b.personid ;quit;

data trials1; set trials_source; format Start_date mmddyy8.; format end_date mmddyy8.;
	start_date = datepart(startdate); end_date = datepart(enddate); run;

proc sql; create table trials1a as
select *, input(put(datepart(startdate),year4.),11.) as year format=11. from trials1 ;quit;

data trials1a; set trials1a; format Year1 11.; Year1 = year; drop year; run;

proc sql; create table trialsjoin as
select distinct nct_id, personid from sasdata.aa_cd_matches_trials a
where nct_id in (select nct_id from trials1a) and personid in (select distinct personid from allfaculty);
quit;

proc sql; create table trials1 as
select distinct a.*, b.personid as personid2
from trials1a a left join trialsjoin b on a.nct_id = b.nct_id
where a.personid ne b.personid;
quit;

data trials_final; set trials1; length Collab_ID $200; Collab_ID = NCT_ID; run;

*****************************************************************;
/***OUTPUTS: join collaborator (personid2) back to WANT for their attributes.
   Because "want" is no longer collapsed to one row per person, this join
   fans out across ALL of the collaborator's (unit, discipline) rows too -
   this is the "both sides" cross-product explosion, happening for free via
   the existing join shape. Also carries Collab_UnitType and Collab_Disc
   (renamed from the per-row Discipline) instead of the old Collab_Cat.***/

%macro collab_out(src=, ctype=);
proc sql; create table &src._output as
select distinct
	a.*,
	"&ctype." as CollaborationType,
	b.institutionid   as Collab_InstitutionId,
	b.institutionname as Collab_Institution,
	b.state           as Collab_State,
	b.College         as Collab_College,
	b.unitid          as Collab_UnitId,
	b.unitname        as Collab_Department,
	b.UnitType        as Collab_UnitType,
	b.Discipline      as Collab_Disc,
	b.taxonomylevel03name as Collab_BF,
	b.personid        as Collab_PersonID,
	b.personname      as Collab_PersonName
from &src._final a
join want b on a.personid2 = b.personid
;quit;
%mend;
%collab_out(src=articles,  ctype=Article);
%collab_out(src=confproc,  ctype=Conference Proceeding);
%collab_out(src=books,     ctype=Book);
%collab_out(src=bookChaps, ctype=Book Chapter);
%collab_out(src=grants,    ctype=Federal Grant);
%collab_out(src=patents,   ctype=Patent);
%collab_out(src=trials,    ctype=Clinical Trial);

*****************************************************************;
/***STANDARDIZE + UNION ALL TYPES - column list updated for UnitType /
   per-row Discipline (was Cat) on both sides.***/;
%macro std(src=, yearcol=, detail=, title=);
	select distinct
		Institutionid, Institutionname,
		College, UnitId, UnitName as Department, UnitType,
		PersonId, PersonName,
		Taxonomylevel03Name as Broad_Field,
		Discipline,
		RankTypeid,
		CollaborationType,
		Collab_InstitutionId,
		Collab_Institution, Collab_State,
		Collab_College, Collab_UnitId, Collab_Department, Collab_UnitType,
		Collab_BF, Collab_Disc,
		Collab_PersonID, Collab_PersonName,
		&yearcol. as Year,
		Collab_ID,
		&detail. as Collab_Detail,
		&title. as Collab_Title
	from &src._output
%mend;

proc sql; create table all_output1 as
%std(src=articles,  yearcol=year,        detail=journalname, title=articletitle)
UNION %std(src=confproc,  yearcol=year,        detail=journalname, title=articletitle)
UNION %std(src=books,     yearcol=publishyear, detail=Publisher,   title=Title)
UNION %std(src=bookchaps, yearcol=publishyear, detail=Title,       title=ChapterTitle)
UNION %std(src=grants,    yearcol=year1,       detail=agencycode,  title=grantname)
UNION %std(src=patents,   yearcol=grantedyear, detail=PatentType,  title=PatentTitle)
UNION %std(src=trials,    yearcol=year1,       detail="Utility",   title=BriefTitle)
;quit;

***Rank label - unchanged;
data all_output2;
	set all_output1;
	length Rank $20.;
	if ranktypeID = 1 then rank = 'Professor';
	else if ranktypeID = 2 then rank = 'Associate Professor';
	else if ranktypeID = 3 then rank = 'Assistant Professor';
	else rank = 'Other';
	drop ranktypeid;
run;

/***NEW: Relationship classification (Within Unit / Across Units / Across
   Institutions), matching the portal's own pair-grain scope labels. Computed
   here in SAS, not left to the client. Note this only produces a meaningful
   label when comparing like-for-like UnitType (Department-to-Department or
   Program-to-Program); a mismatched-type row (e.g. focal seen via Department,
   collaborator only via Program) will fall out as "Across Units" by simple
   UnitId inequality, which is correct once the client applies the
   Department/Program toggle filter (it drops mismatched-type rows before
   display, so this edge case never actually surfaces to a user).***/
data all_output3;
	set all_output2;
	length Collab_Dir $8 Relationship $20;
	if Collab_InstitutionId = &institutionid. then Collab_Dir = 'Internal';
	else Collab_Dir = 'External';

	if Collab_InstitutionId ne &institutionid. then Relationship = 'Across Institutions';
	else if UnitId = Collab_UnitId then Relationship = 'Within Unit';
	else Relationship = 'Across Units';
run;

*****************************************************************;
/***EXPORT***/;
proc export data=all_output3 outfile="&outputloc.\details_base.csv" replace; run;
