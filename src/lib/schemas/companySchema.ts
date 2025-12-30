import { z } from "zod";

/**
 * Shared Company Schema
 * 
 * This schema is used by both the public registration form (/register)
 * and the Admin Global company creation/edit form.
 * 
 * Any changes here will affect both forms to ensure consistency.
 */

// Helper for phone validation (Brazilian format)
const phoneRegex = /^(\(\d{2}\)\s?)?\d{4,5}-?\d{4}$/;

// Helper for CNPJ/CPF validation (basic format check)
const documentRegex = /^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{11}|\d{14})$/;

/**
 * Base fields for company identification
 * These are the core fields that identify a company
 */
export const companyIdentificationSchema = z.object({
  // Company Name - Required
  name: z
    .string()
    .min(2, "Nome da empresa deve ter no mínimo 2 caracteres")
    .max(100, "Nome da empresa deve ter no máximo 100 caracteres")
    .transform((val) => val.trim()),

  // Company Document (CNPJ/CPF) - Optional but validated if provided
  document: z
    .string()
    .max(20, "Documento deve ter no máximo 20 caracteres")
    .optional()
    .transform((val) => val?.trim() || undefined),

  // Company Email - Optional but validated if provided
  email: z
    .string()
    .email("Email inválido")
    .max(255, "Email deve ter no máximo 255 caracteres")
    .optional()
    .transform((val) => val?.trim().toLowerCase() || undefined),

  // Company Phone - Optional
  phone: z
    .string()
    .max(20, "Telefone deve ter no máximo 20 caracteres")
    .optional()
    .transform((val) => val?.trim() || undefined),
});

/**
 * Admin user fields
 * Used when creating a company with an admin user
 */
export const adminUserSchema = z.object({
  // Admin Name - Required for registration
  admin_name: z
    .string()
    .min(2, "Nome do administrador deve ter no mínimo 2 caracteres")
    .max(100, "Nome do administrador deve ter no máximo 100 caracteres")
    .transform((val) => val.trim()),

  // Admin Email - Required for registration
  admin_email: z
    .string()
    .email("Email do administrador inválido")
    .max(255, "Email deve ter no máximo 255 caracteres")
    .transform((val) => val.trim().toLowerCase()),
});

/**
 * Optional admin user fields (for Admin Global form where admin is optional)
 */
export const optionalAdminUserSchema = z.object({
  admin_name: z
    .string()
    .max(100, "Nome do administrador deve ter no máximo 100 caracteres")
    .optional()
    .transform((val) => val?.trim() || undefined),

  admin_email: z
    .string()
    .email("Email do administrador inválido")
    .max(255, "Email deve ter no máximo 255 caracteres")
    .optional()
    .transform((val) => val?.trim().toLowerCase() || undefined),
});

/**
 * Plan and limits fields (Admin Global only)
 */
export const companyPlanSchema = z.object({
  plan_id: z.string().uuid().optional(),
  max_users: z.number().int().min(1).max(1000).default(5),
  max_instances: z.number().int().min(1).max(100).default(2),
});

/**
 * Subdomain field (Admin Global only)
 */
export const subdomainSchema = z.object({
  subdomain: z
    .string()
    .min(3, "Subdomínio deve ter no mínimo 3 caracteres")
    .max(30, "Subdomínio deve ter no máximo 30 caracteres")
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Subdomínio deve conter apenas letras minúsculas, números e hífens")
    .optional()
    .transform((val) => val?.toLowerCase() || undefined),
});

/**
 * PUBLIC REGISTRATION SCHEMA
 * Used by: /register page
 * 
 * Requires: Company name, Admin name, Admin email, Plan
 * Optional: Document, Phone
 */
export const publicRegistrationSchema = z.object({
  companyName: z
    .string()
    .min(2, "Nome da empresa deve ter no mínimo 2 caracteres")
    .max(100, "Nome da empresa deve ter no máximo 100 caracteres")
    .transform((val) => val.trim()),

  adminName: z
    .string()
    .min(2, "Nome do responsável deve ter no mínimo 2 caracteres")
    .max(100, "Nome do responsável deve ter no máximo 100 caracteres")
    .transform((val) => val.trim()),

  email: z
    .string()
    .email("Email inválido")
    .max(255, "Email deve ter no máximo 255 caracteres")
    .transform((val) => val.trim().toLowerCase()),

  phone: z
    .string()
    .max(20, "Telefone deve ter no máximo 20 caracteres")
    .optional()
    .transform((val) => val?.trim() || undefined),

  document: z
    .string()
    .max(20, "Documento deve ter no máximo 20 caracteres")
    .optional()
    .transform((val) => val?.trim() || undefined),

  // Plan selection - Required
  planId: z
    .string()
    .uuid("Selecione um plano válido")
    .min(1, "Selecione um plano"),
});

/**
 * ADMIN GLOBAL CREATE COMPANY SCHEMA
 * Used by: GlobalAdminCompanies create dialog
 * 
 * Includes all fields for complete company setup
 */
export const adminCreateCompanySchema = companyIdentificationSchema
  .merge(optionalAdminUserSchema)
  .merge(companyPlanSchema)
  .merge(subdomainSchema)
  .extend({
    auto_activate_workflow: z.boolean().default(true),
  });

/**
 * ADMIN GLOBAL UPDATE COMPANY SCHEMA
 * Used by: GlobalAdminCompanies edit dialog
 * 
 * Same as create but all fields optional for partial updates
 */
export const adminUpdateCompanySchema = adminCreateCompanySchema.partial();

// Type exports
export type PublicRegistrationData = z.infer<typeof publicRegistrationSchema>;
export type AdminCreateCompanyData = z.infer<typeof adminCreateCompanySchema>;
export type AdminUpdateCompanyData = z.infer<typeof adminUpdateCompanySchema>;

/**
 * Field configuration for consistent form rendering
 * Both forms should use these configurations
 */
export const companyFieldConfig = {
  companyName: {
    label: "Nome da Empresa",
    placeholder: "Sua empresa",
    required: true,
    maxLength: 100,
  },
  adminName: {
    label: "Nome do Responsável",
    placeholder: "Nome completo",
    required: true,
    maxLength: 100,
  },
  email: {
    label: "Email",
    placeholder: "contato@empresa.com",
    required: true,
    maxLength: 255,
    type: "email" as const,
  },
  phone: {
    label: "Telefone",
    placeholder: "(00) 00000-0000",
    required: false,
    maxLength: 20,
    type: "tel" as const,
  },
  document: {
    label: "CNPJ/CPF",
    placeholder: "00.000.000/0000-00",
    required: false,
    maxLength: 20,
  },
  planId: {
    label: "Plano Desejado",
    placeholder: "Selecione um plano",
    required: true,
  },
} as const;
