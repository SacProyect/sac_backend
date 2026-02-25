// import { describe, it, expect, vi } from "vitest";
// import { calculateComplianceScore } from "../../reports/reports-services";
// import { Decimal } from "@prisma/client/runtime/library";

// describe("calculateComplianceScore", () => {
//   const currentYear = 2026;
//   const fechaFin = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59)); // End of 2026
  
//   const mockIndexIva = [
//     {
//       contract_type: "ORDINARY",
//       base_amount: new Decimal(100),
//       created_at: new Date(Date.UTC(2025, 0, 1)),
//       expires_at: null,
//     },
//     {
//       contract_type: "SPECIAL",
//       base_amount: new Decimal(500),
//       created_at: new Date(Date.UTC(2025, 0, 1)),
//       expires_at: null,
//     }
//   ];

//   it("1. Contribuyente sin reportes IVA ni índice -> score: 0, clasificacion: 'BAJO'", () => {
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "UNKNOWN",
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: []
//     };
//     const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//     expect(result.score).toBe(0);
//     expect(result.clasificacion).toBe("BAJO");
//     expect(result.indexUsed.type).toBe("NONE");
//   });

//   it("2. Contribuyente con 12 meses pagados al 100% -> score: 100, clasificacion: 'ALTO'", () => {
//     const reports = [];
//     for (let m = 0; m < 12; m++) {
//       reports.push({
//         date: new Date(Date.UTC(currentYear, m, 1)), // Use 1st of month
//         paid: new Decimal(100)
//       });
//     }
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY",
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: reports
//     };
//     const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//     expect(result.score).toBe(100);
//     expect(result.clasificacion).toBe("ALTO");
//   });

//   it("3. Contribuyente con 6/12 meses pagados al 100% -> score: 50, clasificacion: 'MEDIO'", () => {
//     const reports = [];
//     for (let m = 0; m < 6; m++) {
//       reports.push({
//         date: new Date(Date.UTC(currentYear, m, 1)),
//         paid: new Decimal(100)
//       });
//     }
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY",
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: reports
//     };
//     const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//     expect(result.score).toBe(50);
//     expect(result.clasificacion).toBe("MEDIO");
//   });

//   it("4. Contribuyente con TaxpayerIndexIva activo -> Prioriza nueva tabla sobre IndexIva general", () => {
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY", // General is 100
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: [{ date: new Date(Date.UTC(currentYear, 0, 1)), paid: new Decimal(200) }],
//       TaxpayerIndexIva: [{ active: true, created_at: new Date(Date.UTC(2025, 0, 1)), expires_at: null, base_amount: new Decimal(200) }]
//     };
//     // Custom is 200. We test only one month to avoid average diluting.
//     const oneMonthFin = new Date(Date.UTC(currentYear, 0, 31));
//     const result = calculateComplianceScore(taxpayer, oneMonthFin, currentYear, mockIndexIva);
//     expect(result.indexUsed.type).toBe("CUSTOM");
//     expect(result.indexUsed.value).toBe(200);
//     expect(result.score).toBe(100); // 200/200
//   });

//   it("5. Contribuyente con TaxpayerIndexIva null/undefined -> Cae al fallback (general)", () => {
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY", // General is 100
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: [{ date: new Date(Date.UTC(currentYear, 0, 1)), paid: new Decimal(100) }]
//     };
//     const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//     expect(result.indexUsed.type).toBe("GENERAL");
//     expect(result.indexUsed.value).toBe(100);
//   });

//   it("6. Contribuyente SPECIAL vs ORDINARY con mismo pago -> Scores distintos según su IndexIva", () => {
//     const oneMonthFin = new Date(Date.UTC(currentYear, 0, 31));
//     const taxpayerOrd = {
//       id: "tp-ord",
//       contract_type: "ORDINARY", // 100
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: [{ date: new Date(Date.UTC(currentYear, 0, 1)), paid: new Decimal(100) }]
//     };
//     const taxpayerSpec = {
//       id: "tp-spec",
//       contract_type: "SPECIAL", // 500
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: [{ date: new Date(Date.UTC(currentYear, 0, 1)), paid: new Decimal(100) }]
//     };
    
//     const resultOrd = calculateComplianceScore(taxpayerOrd, oneMonthFin, currentYear, mockIndexIva);
//     const resultSpec = calculateComplianceScore(taxpayerSpec, oneMonthFin, currentYear, mockIndexIva);
    
//     expect(resultOrd.score).toBe(100);
//     expect(resultSpec.score).toBe(20); // 100/500 = 20%
//   });

//   it("7. Contribuyente con taxpayer.index_iva (legacy) pero sin CUSTOM -> Usa IndexIva general, ignora legacy", () => {
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY", // 100
//       index_iva: 999, // Legacy should be ignored
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: [{ date: new Date(Date.UTC(currentYear, 0, 1)), paid: new Decimal(100) }]
//     };
//     const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//     expect(result.indexUsed.type).toBe("GENERAL");
//     expect(result.indexUsed.value).toBe(100);
//   });

//   it("8. emition_date a mitad de año → meses exigibles parciales correctamente", () => {
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY",
//       emition_date: new Date(Date.UTC(currentYear, 6, 1)), // July (Index 6)
//       IVAReports: []
//     };
//     const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//     // July to Dec = 6 months
//     expect(result.mesesExigibles).toBe(6);
//   });

//   it("9. expected = 0 para un mes → no penaliza (mes excluido del promedio)", () => {
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY",
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: [{ date: new Date(Date.UTC(currentYear, 0, 1)), paid: new Decimal(100) }]
//     };
//     // Provoking expected = 0 by passing empty indices
//     const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, []);
//     expect(result.score).toBe(0); 
//     // And if 1 month has expected and is paid 100%, and others don't have expected:
//     const mixedIndices = [{
//         contract_type: "ORDINARY",
//         base_amount: new Decimal(100),
//         created_at: new Date(Date.UTC(currentYear, 0, 1)),
//         expires_at: new Date(Date.UTC(currentYear, 1, 1)), // Only active in Jan
//     }];
//     const result2 = calculateComplianceScore(taxpayer, fechaFin, currentYear, mixedIndices);
//     expect(result2.score).toBe(100); // Only Jan evaluated, Jan paid 100/100
//   });

//   it("10. Pagos que exceden el esperado → capped a 100% (ratio = min(1, paid/expected))", () => {
//     const oneMonthFin = new Date(Date.UTC(currentYear, 0, 31));
//     const taxpayer = {
//       id: "tp-1",
//       contract_type: "ORDINARY", // 100
//       emition_date: new Date(Date.UTC(currentYear, 0, 1)),
//       IVAReports: [{ date: new Date(Date.UTC(currentYear, 0, 1)), paid: new Decimal(500) }]
//     };
//     const result = calculateComplianceScore(taxpayer, oneMonthFin, currentYear, mockIndexIva);
//     expect(result.score).toBe(100);
//   });

//   describe("indexUsed en respuestas", () => {
//     it("11. TaxpayerIndexIva activa presente -> indexUsed.type = 'CUSTOM'", () => {
//       const taxpayer = { id: "tp-1", contract_type: "ORDINARY", emition_date: new Date(Date.UTC(currentYear, 0, 1)), IVAReports: [], TaxpayerIndexIva: [{ active: true, created_at: new Date(Date.UTC(2025, 0, 1)), expires_at: null, base_amount: new Decimal(250) }] };
//       const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//       expect(result.indexUsed.type).toBe("CUSTOM");
//       expect(result.indexUsed.value).toBe(250);
//     });

//     it("12. Solo IndexIva general -> indexUsed.type = 'GENERAL'", () => {
//       const taxpayer = { id: "tp-1", contract_type: "ORDINARY", emition_date: new Date(Date.UTC(currentYear, 0, 1)), IVAReports: [] };
//       const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//       expect(result.indexUsed.type).toBe("GENERAL");
//       expect(result.indexUsed.value).toBe(100);
//     });

//     it("13. taxpayer.index_iva presente pero sin CUSTOM -> indexUsed.type = 'GENERAL'", () => {
//       const taxpayer = { id: "tp-1", contract_type: "ORDINARY", index_iva: 50, emition_date: new Date(Date.UTC(currentYear, 0, 1)), IVAReports: [] };
//       const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, mockIndexIva);
//       expect(result.indexUsed.type).toBe("GENERAL");
//     });

//     it("14. Sin ningún índice -> indexUsed.type = 'NONE', value = 0", () => {
//       const taxpayer = { id: "tp-1", contract_type: "NON_EXISTENT", emition_date: new Date(Date.UTC(currentYear, 0, 1)), IVAReports: [] };
//       const result = calculateComplianceScore(taxpayer, fechaFin, currentYear, []);
//       expect(result.indexUsed.type).toBe("NONE");
//       expect(result.indexUsed.value).toBe(0);
//     });
//   });

//   describe("Umbrales de clasificación (consistencia)", () => {
//     const mockResult = (targetScore: number) => {
//       const lastMonthDate = new Date(Date.UTC(currentYear, 11, 1));
//       const taxpayer = {
//         id: "tp-1",
//         contract_type: "ORDINARY",
//         emition_date: lastMonthDate,
//         IVAReports: [{ date: lastMonthDate, paid: new Decimal(targetScore) }]
//       };
//       return calculateComplianceScore(taxpayer, fechaFin, currentYear, [{
//         contract_type: "ORDINARY",
//         base_amount: new Decimal(100),
//         created_at: new Date(2000, 0, 1),
//         expires_at: null
//       }]);
//     };

//     it("15. Score = 80 → ALTO", () => {
//       expect(mockResult(80).clasificacion).toBe("ALTO");
//     });
//     it("16. Score = 79.99 → MEDIO", () => {
//        expect(mockResult(79.99).clasificacion).toBe("MEDIO");
//     });
//     it("17. Score = 50 → MEDIO", () => {
//       expect(mockResult(50).clasificacion).toBe("MEDIO");
//     });
//     it("18. Score = 49.99 → BAJO", () => {
//       expect(mockResult(49.99).clasificacion).toBe("BAJO");
//     });
//   });
// });
