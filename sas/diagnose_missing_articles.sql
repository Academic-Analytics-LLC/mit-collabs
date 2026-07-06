/* ============================================================================
   Diagnose the "missing_from_ours" articles from the bulk cross-check
   (bulk_diffs_department.csv / bulk_diffs_program.csv vs details_base.csv).

   1,112 + 1,910 missing PAIR-rows collapse to just 163 DISTINCT DOIs (the
   fan-out comes from multi-author papers - e.g. one big JHEP physics paper
   alone accounts for dozens of ordered-pair rows). So the real question isn't
   "1000+ things are wrong," it's "why are these 163 articles absent from our
   extract entirely" - much more tractable.

   Run against the AAD2024-2904 database (same DB the SAS extract's `sasdata`
   libname points at: libname sasdata odbc dsn='analysis1' schema=dbo
   qualifier='AAD2024-2904'). Adjust the USE / three-part names below if your
   SSMS connection maps the server/database differently.

   Table names below are taken directly from the working, already-validated
   extract (details_extract_AAD2024_MIT.sas) - not guessed.
============================================================================ */

USE [AAD2024-2904];
GO

IF OBJECT_ID('tempdb..#missing_dois') IS NOT NULL DROP TABLE #missing_dois;
CREATE TABLE #missing_dois (doi VARCHAR(200));
INSERT INTO #missing_dois (doi) VALUES
('10.1002/LNO.12363'),('10.1007/JHEP03(2022)187'),('10.1007/JHEP04(2021)170'),
('10.1007/JHEP11(2022)149'),('10.1007/JHEP12(2022)035'),('10.1007/S11002-022-09617-8'),
('10.1016/J.CBPA.2021.08.009'),('10.1016/J.CHEMGEO.2021.120355'),('10.1016/J.CHEMGEO.2021.120652'),
('10.1016/J.JBC.2024.107240'),('10.1016/J.JCYT.2024.03.030'),('10.1016/J.JCYT.2024.03.443'),
('10.1016/J.MEMSCI.2021.119961'),('10.1016/J.PSS.2020.105151'),('10.1016/J.TOXLET.2024.07.745'),
('10.1017/FMP.2021.14'),('10.1021/ACS.BIOCONJCHEM.3C00268'),('10.1021/ACS.JCIM.1C00834'),
('10.1021/ACSANM.4C01524'),('10.1021/ACSESTENGG.0C00034'),('10.1021/ACSESTWATER.0C00034'),
('10.1021/ACSOMEGA.4C08041'),('10.1021/JACS.2C04948'),('10.1038/S41377-021-00519-4'),
('10.1038/S41467-021-25672-7'),('10.1038/S41467-022-28397-3'),('10.1038/S41467-022-32333-W'),
('10.1038/S41467-023-40559-5'),('10.1038/S41467-024-50181-8'),('10.1038/S41467-024-51527-Y'),
('10.1038/S41551-023-01006-4'),('10.1038/S41560-021-00819-4'),('10.1038/S41560-024-01517-7'),
('10.1038/S41562-023-01676-9'),('10.1038/S41562-024-01945-1'),('10.1038/S41565-022-01109-0'),
('10.1038/S41567-023-01992-X'),('10.1038/S41567-023-02368-X'),('10.1038/S41569-023-00982-Z'),
('10.1038/S41586-021-03191-1'),('10.1038/S41586-021-03397-3'),('10.1038/S41586-021-03464-9'),
('10.1038/S41586-021-04149-Z'),('10.1038/S41586-021-04226-3'),('10.1038/S41586-022-05321-9'),
('10.1038/S41586-022-05599-9'),('10.1038/S41586-023-06108-2'),('10.1038/S41586-023-06164-8'),
('10.1038/S41586-023-06263-6'),('10.1038/S41586-024-07737-X'),('10.1038/S41586-024-08434-5'),
('10.1038/S41588-023-01315-Z'),('10.1038/S41588-023-01318-W'),('10.1038/S41589-023-01491-3'),
('10.1038/S41591-021-01250-8'),('10.1038/S41593-023-01507-0'),('10.1038/S41593-024-01584-9'),
('10.1038/S41597-023-01945-2'),('10.1038/S41597-023-02136-9'),('10.1038/S41928-021-00572-2'),
('10.1038/S41928-023-01101-Z'),('10.1038/S43018-021-00283-9'),('10.1039/D1EE90017J'),
('10.1039/D2EA90009B'),('10.1073/PNAS.2114995118'),('10.1086/718327'),
('10.1090/NOTI2290'),('10.1093/INFDIS/JIAD334'),('10.1093/JPIDS/PIAA170.042'),
('10.1093/JPIDS/PIAB031.025'),('10.1093/MAM/OZAE044.539'),('10.1093/MAM/OZAE044.808'),
('10.1093/MAM/OZAE044.916'),('10.1093/MICMIC/OZAD067.650'),('10.1093/MICMIC/OZAD067.894'),
('10.1093/NEUONC/NOAB196.792'),('10.1096/FASEBJ.2022.36.S1.R2341'),('10.1097/CCM.0000000000005648'),
('10.1103/PHYSREVC.107.049903'),('10.1103/PHYSREVD.104.109903'),('10.1103/PHYSREVD.110.119904'),
('10.1109/CLEO/EUROPE-EQEC52157.2021.9542401'),('10.1109/INTERMAGSHORTPAPERS58606.2023.10228723'),
('10.1109/OCEANSLIMERICK52467.2023.10244514'),('10.1109/TED.2024.3450435'),
('10.1109/VLSITECHNOLOGYANDCIR46769.2022.9830365'),('10.1121/10.0005322'),('10.1121/10.0007701'),
('10.1121/10.0007815'),('10.1121/10.0007970'),('10.1121/10.0007979'),('10.1121/10.0008295'),
('10.1121/10.0008456'),('10.1121/10.0008558'),('10.1121/10.0010616'),('10.1121/10.0011019'),
('10.1121/10.0015418'),('10.1121/10.0015423'),('10.1121/10.0015424'),('10.1121/10.0015425'),
('10.1121/10.0015428'),('10.1121/10.0015484'),('10.1121/10.0015974'),('10.1121/10.0018933'),
('10.1121/10.0026936'),('10.1121/10.0026941'),('10.1121/10.0027256'),('10.1121/10.0027257'),
('10.1128/MSYSTEMS.00120-24'),('10.1136/JITC-2021-SITC2021.303'),('10.1136/JITC-2021-SITC2021.683'),
('10.1136/JITC-2021-SITC2021.721'),('10.1136/JITC-2021-SITC2021.738'),('10.1136/JITC-2021-SITC2021.766'),
('10.1140/EPJC/S10052-021-08863-W'),('10.1140/EPJC/S10052-021-08959-3'),('10.1140/EPJC/S10052-022-10276-2'),
('10.1140/EPJC/S10052-022-10277-1'),('10.1140/EPJC/S10052-022-10278-0'),('10.1140/EPJC/S10052-023-11272-W'),
('10.1140/EPJC/S10052-023-11815-1'),('10.1140/EPJC/S10052-023-11832-0'),('10.1145/3450351'),
('10.1145/3572897'),('10.1145/3658644.3691421'),('10.1158/1538-7445.AM2021-2506'),
('10.1158/1538-7445.AM2021-309'),('10.1158/1538-7445.AM2021-NG10'),('10.1158/1538-7445.AM2022-365'),
('10.1158/1538-7445.AM2023-3371'),('10.1158/2326-6074.TUMIMM20-PO043'),('10.1158/2326-6074.TUMIMM20-PR010'),
('10.1175/BAMS-D-21-0083.1'),('10.1175/BAMS-D-22-0072.1'),('10.1175/BAMS-D-24-0100.1'),
('10.1182/BLOOD-2022-169700'),('10.1186/S12859-023-05313-0'),('10.1186/S13287-024-04048-W'),
('10.1200/JCO.2021.39.15_SUPPL.3131'),('10.23919/VLSITECHNOLOGYANDCIR57934.2023.10185279'),
('10.2514/6.2022-0343.C1'),('10.2514/6.2022-0587.C1'),('10.2514/6.2023-3422.C1'),
('10.2514/6.2023-4158.C1'),('10.3389/FMARS.2023.1361265'),('10.3847/1538-3881/AC2D32'),
('10.3847/1538-3881/AC4477'),('10.3847/1538-3881/ACB589'),('10.3847/1538-4357/AC05C3'),
('10.3847/1538-4357/AC1F2C'),('10.3847/1538-4357/AC1F2D'),('10.3847/1538-4357/AC4267'),
('10.3847/25C2CFEB.026A7425'),('10.3847/25C2CFEB.1F3849DB'),('10.3847/25C2CFEB.4B695863'),
('10.3847/25C2CFEB.8EF223F3'),('10.3847/25C2CFEB.9D29EF85'),('10.3847/25C2CFEB.BC2B9583'),
('10.4049/JIMMUNOL.206.SUPP.29.05'),('10.4049/JIMMUNOL.208.SUPP.122.09'),('10.5334/AOGH.3916'),
('10.5334/AOGH.4331'),('10.7185/GOLD2023.17618');


/* ----------------------------------------------------------------------------
   CHECK 1 - Does the DOI exist at all in the article-person match table, and
   for whom? Mirrors the extract's own join: upper(doi) = upper(b.doi).
   If a DOI/person pair is simply ABSENT here, that's an upstream AA-matching
   gap (not something our SAS pipeline can fix) - not our bug.
---------------------------------------------------------------------------- */
SELECT m.doi, m.personid, m.year, m.isconfproc, m.journalid
FROM dbo.aa_cd_matches_articles m
JOIN #missing_dois d ON UPPER(m.doi) = UPPER(d.doi)
ORDER BY m.doi, m.personid;

-- Roll-up: how many of the 163 DOIs have ZERO rows here at all (fully
-- unmatched to any MIT person) vs at least one match?
SELECT
    (SELECT COUNT(*) FROM #missing_dois) AS total_missing_dois,
    (SELECT COUNT(DISTINCT UPPER(d.doi)) FROM #missing_dois d
        JOIN dbo.aa_cd_matches_articles m ON UPPER(m.doi) = UPPER(d.doi)) AS dois_with_any_match;


/* ----------------------------------------------------------------------------
   CHECK 2 - Year mismatch: the extract filters `where year in (2021:2024)`
   using aa_cd_matches_articles.year specifically. If the bulk portal view's
   "pubyear" differs from THIS table's year for the same doi/person (e.g.
   epub-ahead-of-print vs official issue year), the extract's year filter
   would silently drop a row the portal still counts as 2021-2024.
---------------------------------------------------------------------------- */
SELECT m.doi, m.year, COUNT(DISTINCT m.personid) AS n_people
FROM dbo.aa_cd_matches_articles m
JOIN #missing_dois d ON UPPER(m.doi) = UPPER(d.doi)
GROUP BY m.doi, m.year
ORDER BY m.doi, m.year;
-- Look for: same doi appearing with a year OUTSIDE 2021-2024 here (root cause
-- confirmed - it's a year-field discrepancy, not a real gap) vs a year that
-- IS 2021-2024 (rules this out, points elsewhere).


/* ----------------------------------------------------------------------------
   CHECK 3 - isconfproc mismatch: the extract keys Article vs Conference
   Proceeding off aa_cd_matches_articles.isconfproc. If the SAME doi carries
   BOTH isconfproc=0 and =1 across different person-rows (or a different value
   than what the bulk view assumed), the resulting CollaborationType wouldn't
   line up with the oracle key even though the underlying doi/pair truly exists.
---------------------------------------------------------------------------- */
SELECT doi, isconfproc, COUNT(DISTINCT personid) AS n_people
FROM dbo.aa_cd_matches_articles
WHERE UPPER(doi) IN (SELECT UPPER(doi) FROM #missing_dois)
GROUP BY doi, isconfproc
ORDER BY doi;
-- Look for: any doi with MORE THAN ONE ROW here (both 0 and 1 present) - that
-- doi has a real type inconsistency in the source data itself.


/* ----------------------------------------------------------------------------
   CHECK 4 - Comp-table capture: the extract only produces a row for a person
   if they appear in ONE of the four institution-123 comp tables (Department/
   Program/Medical/Clinical) that feed `f1`/`want`. A person matched to the
   article but ABSENT from all four would never reach the extract even though
   the article-person match itself is fine.
---------------------------------------------------------------------------- */
SELECT DISTINCT
    m.doi, m.personid,
    CASE WHEN d.personid  IS NOT NULL THEN 1 ELSE 0 END AS in_dept_comp,
    CASE WHEN pr.personid IS NOT NULL THEN 1 ELSE 0 END AS in_prog_comp,
    CASE WHEN me.personid IS NOT NULL THEN 1 ELSE 0 END AS in_med_comp,
    CASE WHEN cl.personid IS NOT NULL THEN 1 ELSE 0 END AS in_clin_comp
FROM dbo.aa_cd_matches_articles m
JOIN #missing_dois md ON UPPER(m.doi) = UPPER(md.doi)
LEFT JOIN dbo.aa_c_level01_dept_fac_comp d  ON d.personid  = m.personid AND d.institutionid  = 123
LEFT JOIN dbo.aa_c_level01_prog_fac_comp pr ON pr.personid = m.personid AND pr.institutionid = 123
LEFT JOIN dbo.aa_c_level01_med_fac_comp me  ON me.personid = m.personid AND me.institutionid = 123
LEFT JOIN dbo.aa_c_level01_clin_fac_comp cl ON cl.personid = m.personid AND cl.institutionid = 123
ORDER BY m.doi, m.personid;
-- Look for: a personid with all four flags = 0 - that person is matched to
-- the article but genuinely isn't captured as MIT faculty in any comp table
-- for this release, which would fully explain the gap for that doi.


/* ----------------------------------------------------------------------------
   CHECK 5 - Summary per DOI: combines checks 2-4 into one pass/fail read so
   you don't have to cross-reference three result sets by hand. For each
   missing doi, shows whether EVERY matched person looks "clean" (year in
   window, comp-table captured) - if so, the drop is happening somewhere else
   in the extract logic (worth flagging back to me), not in the source data.
---------------------------------------------------------------------------- */
SELECT
    md.doi,
    COUNT(DISTINCT m.personid) AS n_matched_people,
    SUM(CASE WHEN m.year BETWEEN 2021 AND 2024 THEN 1 ELSE 0 END) AS n_in_year_window,
    SUM(CASE WHEN d.personid IS NOT NULL OR pr.personid IS NOT NULL
              OR me.personid IS NOT NULL OR cl.personid IS NOT NULL THEN 1 ELSE 0 END) AS n_in_any_comp_table
FROM #missing_dois md
LEFT JOIN dbo.aa_cd_matches_articles m ON UPPER(m.doi) = UPPER(md.doi)
LEFT JOIN dbo.aa_c_level01_dept_fac_comp d  ON d.personid  = m.personid AND d.institutionid  = 123
LEFT JOIN dbo.aa_c_level01_prog_fac_comp pr ON pr.personid = m.personid AND pr.institutionid = 123
LEFT JOIN dbo.aa_c_level01_med_fac_comp me  ON me.personid = m.personid AND me.institutionid = 123
LEFT JOIN dbo.aa_c_level01_clin_fac_comp cl ON cl.personid = m.personid AND cl.institutionid = 123
GROUP BY md.doi
ORDER BY n_matched_people ASC, md.doi;
-- n_matched_people = 0            -> upstream matching gap, not our bug
-- n_matched_people > 0 but
--   n_in_year_window < n_matched  -> year-field discrepancy (Check 2)
--   n_in_any_comp_table < n_matched -> comp-table capture gap (Check 4)
--   both equal n_matched_people   -> everything looks clean upstream; the
--                                     drop is happening inside the extract
--                                     itself - send me this doi list back
