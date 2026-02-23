import { taxpayer_contract_type, taxpayer_process, Taxpayer_Fases } from "@prisma/client";
import { InvestigationPdf } from "../taxpayer-utils";

export class CreateTaxpayerDto {
    providenceNum!: bigint;
    process!: taxpayer_process;
    name!: string;
    rif!: string;
    emition_date!: Date;
    contract_type!: taxpayer_contract_type;
    officerId!: string;
    address!: string;
    pdfs?: InvestigationPdf[];
    userId?: string;
    role?: string;
    categoryId!: string;
    parishId!: string;
}

export class UpdateTaxpayerDto {
    name?: string;
    rif?: string;
    providenceNum?: bigint;
    contract_type?: taxpayer_contract_type;
    process?: taxpayer_process;
    fase?: Taxpayer_Fases;
    address?: string;
    parish_id?: string;
    taxpayer_category_id?: string;
}
