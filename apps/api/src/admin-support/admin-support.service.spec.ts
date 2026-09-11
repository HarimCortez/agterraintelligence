import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { StripeClientService } from "../monetization/stripe-client.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { AdminSupportService } from "./admin-support.service";

const ADMIN: AuthenticatedAdminUser = {
  id: "admin-1",
  email: "admin@example.com",
  internalRole: "support_agent",
  status: "active",
  mfaEnrolled: false,
};

describe("AdminSupportService", () => {
  let service: AdminSupportService;

  const prismaMock = {
    supportTicket: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    supportTicketMessage: { findMany: jest.fn(), create: jest.fn() },
    reportOrder: { update: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
  };
  const auditLogMock = { record: jest.fn() };
  const refundsCreateMock = jest.fn();
  const stripeClientMock = { getClient: jest.fn(() => ({ refunds: { create: refundsCreateMock } })) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminSupportService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogMock },
        { provide: StripeClientService, useValue: stripeClientMock },
      ],
    }).compile();
    service = moduleRef.get(AdminSupportService);
  });

  describe("listTickets", () => {
    it("filters by status when provided", async () => {
      prismaMock.supportTicket.findMany.mockResolvedValue([]);
      prismaMock.supportTicket.count.mockResolvedValue(0);

      await service.listTickets({ status: "open", limit: 10, offset: 0 });

      expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "open" } }),
      );
    });
  });

  describe("getTicketById", () => {
    it("404s when the ticket doesn't exist", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(null);

      await expect(service.getTicketById("missing")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("addMessage", () => {
    const baseTicket = {
      id: "t1", subject: "s", status: "open", relatedReportOrderId: null, relatedPropertyId: null,
      createdAt: new Date(), updatedAt: new Date(), user: { email: "u@example.com" }, assignedAdmin: null,
      relatedReportOrder: null, relatedProperty: null, userId: "user-1",
    };

    beforeEach(() => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({ status: "open" });
      prismaMock.supportTicketMessage.findMany.mockResolvedValue([]);
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", email: "u@example.com", externalRole: "free", status: "active" });
    });

    it("auto-transitions an open ticket to in_progress on a real reply (not an internal note)", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValueOnce({ status: "open" }).mockResolvedValueOnce(baseTicket);

      await service.addMessage("t1", ADMIN, { body: "reply", isInternalNote: false });

      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "t1" }, data: expect.objectContaining({ status: "in_progress" }) }),
      );
      expect(auditLogMock.record).toHaveBeenCalledWith(expect.objectContaining({ action: "support.respond" }));
    });

    it("does not change status for an internal note", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValueOnce({ status: "open" }).mockResolvedValueOnce(baseTicket);

      await service.addMessage("t1", ADMIN, { body: "note", isInternalNote: true });

      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: undefined }) }),
      );
      expect(auditLogMock.record).toHaveBeenCalledWith(expect.objectContaining({ action: "support.note" }));
    });

    it("404s when the ticket doesn't exist", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValueOnce(null);

      await expect(service.addMessage("missing", ADMIN, { body: "b" })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("updateStatus", () => {
    it("records the previous and new status in the audit entry", async () => {
      prismaMock.supportTicket.findUnique
        .mockResolvedValueOnce({ status: "open" })
        .mockResolvedValueOnce({
          id: "t1", subject: "s", status: "resolved", relatedReportOrderId: null, relatedPropertyId: null,
          createdAt: new Date(), updatedAt: new Date(), user: { email: "u@example.com" }, assignedAdmin: null,
          relatedReportOrder: null, relatedProperty: null, userId: "user-1",
        });
      prismaMock.supportTicketMessage.findMany.mockResolvedValue([]);
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", email: "u@example.com", externalRole: "free", status: "active" });

      await service.updateStatus("t1", ADMIN, { status: "resolved" });

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "support.status_update",
          metadata: { previousStatus: "open", newStatus: "resolved" },
        }),
      );
    });
  });

  describe("refundTicketOrder", () => {
    it("404s when the ticket doesn't exist", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(null);

      await expect(service.refundTicketOrder("missing", ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects a ticket with no related report order", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({ relatedReportOrder: null });

      await expect(service.refundTicketOrder("t1", ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      expect(refundsCreateMock).not.toHaveBeenCalled();
    });

    it("rejects an order that's already refunded", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        relatedReportOrder: { id: "order-1", status: "refunded", stripePaymentIntentId: "pi_123" },
      });

      await expect(service.refundTicketOrder("t1", ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect(refundsCreateMock).not.toHaveBeenCalled();
    });

    it("rejects an order that was never paid (no payment intent)", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        relatedReportOrder: { id: "order-1", status: "delivered", stripePaymentIntentId: null },
      });

      await expect(service.refundTicketOrder("t1", ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect(refundsCreateMock).not.toHaveBeenCalled();
    });

    it("issues a real Stripe refund, flips the order to refunded, and audits it", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        relatedReportOrder: { id: "order-1", status: "delivered", stripePaymentIntentId: "pi_123" },
      });
      refundsCreateMock.mockResolvedValue({ id: "re_123" });
      prismaMock.reportOrder.update.mockResolvedValue({ id: "order-1", status: "refunded" });

      const result = await service.refundTicketOrder("t1", ADMIN);

      expect(refundsCreateMock).toHaveBeenCalledWith({ payment_intent: "pi_123" });
      expect(prismaMock.reportOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "order-1" }, data: { status: "refunded" } }),
      );
      expect(result).toEqual({ reportOrderId: "order-1", stripeRefundId: "re_123", status: "refunded" });
      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "support.refund",
          targetType: "report_order",
          targetId: "order-1",
          metadata: { supportTicketId: "t1", stripeRefundId: "re_123" },
        }),
      );
    });
  });
});
