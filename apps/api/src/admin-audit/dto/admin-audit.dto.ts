export interface AuditLogRowDto {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface ListAuditLogResponseDto {
  results: AuditLogRowDto[];
  total: number;
  limit: number;
  offset: number;
}
