import { Context, SessionFlavor } from "grammy";
import { User } from "@prisma/client";

export interface WizardState {
  step:
    | "country"
    | "params"
    | "domains"
    | "templates"
    | "count"
    | "confirm"
    | null;
  country?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  birthYear?: string;
  domains?: string[];
  templates?: string[];
  count?: number;
  generatedEmails?: string[];
}

export interface ExportFilters {
  taskId?: number;
  statuses?: string[];
  domainGroup?: string;
  datePreset?: string;
  uniqueOnly?: boolean;
  format?: "txt" | "csv";
}

export interface AuditExportFilters {
  taskId?: number;
  accountStatuses?: string[];
  datePreset?: string;
  uniqueOnly?: boolean;
  format?: "txt" | "csv";
}

export interface PasswordWizardState {
  step: "firstName" | "lastName" | "birthDate" | "nickname" | "preview" | null;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nickname?: string;
  generatedPasswords?: string[];
}

export interface SessionData {
  wizard: WizardState;
  exportFilters: ExportFilters;
  auditExportFilters: AuditExportFilters;
  settingsInput?: string;
  passwordWizard: PasswordWizardState;
}

export interface BotContext extends Context, SessionFlavor<SessionData> {
  dbUser: User;
}
