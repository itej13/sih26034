import { NextResponse } from "next/server";
import { evaluateScan } from "@/lib/evaluator";
import type { Scan } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { scan?: Scan; rule_pack?: string };
    if (!body.scan || !body.rule_pack) return NextResponse.json({ error: "scan and rule_pack are required" }, { status: 400 });
    return NextResponse.json(evaluateScan(body.scan, body.rule_pack));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rule evaluation failed" }, { status: 400 });
  }
}
