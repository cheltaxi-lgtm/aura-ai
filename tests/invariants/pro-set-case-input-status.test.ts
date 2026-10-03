import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { proQuery } from "@/modules/pro/db";
import { setCaseInput } from "@/modules/pro/db/cases";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.runIf(hasTestDb)("Pro input edits preserve durable generation", () => {
  installDbLifecycle();
  for (const type of ["hd", "natal", "matrix", "manual_spread"] as const) {
    for (const status of ["generating", "delivered", "archived", "input_ready"] as const) {
      it(`${type}: ${status} keeps its status and protects active input`, async () => {
        const accountId = (await proQuery(
          "INSERT INTO pro.accounts(user_id,status,tier) VALUES($1,'active','pro') RETURNING id", [randomUUID()]
        )).rows[0].id;
        const clientId = (await proQuery(
          "INSERT INTO pro.clients(account_id,alias) VALUES($1,'Input fixture') RETURNING id", [accountId]
        )).rows[0].id;
        const caseId = (await proQuery(
          "INSERT INTO pro.cases(account_id,client_id,type,status) VALUES($1,$2,$3,$4) RETURNING id", [accountId, clientId, type, status]
        )).rows[0].id;
        const original = { birthDate: "1987-04-03", privateNote: "Frozen input" };
        const edited = { birthDate: "2001-01-01", privateNote: "Edited input" };
        await proQuery("INSERT INTO pro.case_inputs(case_id,payload,source) VALUES($1,$2::jsonb,'manual')", [caseId, JSON.stringify(original)]);
        if (status === "generating") {
          await expect(setCaseInput(accountId, caseId, edited)).rejects.toMatchObject({ message: "generation_in_progress", status: 409 });
        } else {
          await expect(setCaseInput(accountId, caseId, edited)).resolves.toMatchObject({ status });
        }
        const saved = (await proQuery(
          "SELECT c.status,i.payload FROM pro.cases c JOIN pro.case_inputs i ON i.case_id=c.id WHERE c.id=$1", [caseId]
        )).rows[0];
        expect(saved).toEqual({ status, payload: status === "generating" ? original : edited });
        expect(await setCaseInput("0", caseId, original)).toBeNull();
        expect((await proQuery("SELECT payload FROM pro.case_inputs WHERE case_id=$1", [caseId])).rows[0].payload).toEqual(saved.payload);
      });
    }
  }
});
