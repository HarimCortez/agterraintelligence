import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { PropertiesService } from "../properties/properties.service";
import { AccountContext } from "../common/account-context/account-context";
import { SupportService } from "./support.service";

const CTX: AccountContext = AccountContext.forUser({ id: "user-1", orgId: null });

describe("SupportService", () => {
  let service: SupportService;

  const prismaMock = {
    supportTicket: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    supportTicketMessage: { findMany: jest.fn(), create: jest.fn() },
    reportOrder: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const propertiesServiceMock = { getPropertyById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PropertiesService, useValue: propertiesServiceMock },
      ],
    }).compile();
    service = moduleRef.get(SupportService);
  });

  describe("listForAccount", () => {
    it("scopes the query to the current user only", async () => {
      prismaMock.supportTicket.findMany.mockResolvedValue([
        { id: "t1", subject: "Help", status: "open", relatedReportOrderId: null, relatedPropertyId: null, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const result = await service.listForAccount(CTX);

      expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } }),
      );
      expect(result.count).toBe(1);
    });
  });

  describe("createForAccount", () => {
    it("rejects a relatedReportOrderId that doesn't belong to the current user", async () => {
      prismaMock.reportOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.createForAccount(CTX, { subject: "s", body: "b", relatedReportOrderId: "order-1" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("propagates a 404 when relatedPropertyId doesn't exist", async () => {
      propertiesServiceMock.getPropertyById.mockRejectedValue(new Error("not found"));

      await expect(
        service.createForAccount(CTX, { subject: "s", body: "b", relatedPropertyId: "prop-1" }),
      ).rejects.toThrow();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("creates the ticket and its opening message together, then returns the full detail", async () => {
      const txTicket = { id: "t1", subject: "s", status: "open", relatedReportOrderId: null, relatedPropertyId: null, createdAt: new Date(), updatedAt: new Date() };
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          supportTicket: { create: jest.fn().mockResolvedValue(txTicket) },
          supportTicketMessage: { create: jest.fn().mockResolvedValue({}) },
        }),
      );
      prismaMock.supportTicket.findFirst.mockResolvedValue(txTicket);
      prismaMock.supportTicketMessage.findMany.mockResolvedValue([
        { id: "m1", senderType: "user", body: "b", isInternalNote: false, createdAt: new Date() },
      ]);

      const result = await service.createForAccount(CTX, { subject: "s", body: "b" });

      expect(result.id).toBe("t1");
      expect(result.messages).toHaveLength(1);
    });
  });

  describe("getById", () => {
    it("404s when the ticket doesn't exist or isn't owned by this user", async () => {
      prismaMock.supportTicket.findFirst.mockResolvedValue(null);

      await expect(service.getById(CTX, "missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("never includes internal-note messages", async () => {
      prismaMock.supportTicket.findFirst.mockResolvedValue({
        id: "t1", subject: "s", status: "open", relatedReportOrderId: null, relatedPropertyId: null, createdAt: new Date(), updatedAt: new Date(),
      });
      prismaMock.supportTicketMessage.findMany.mockResolvedValue([]);

      await service.getById(CTX, "t1");

      expect(prismaMock.supportTicketMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ticketId: "t1", isInternalNote: false } }),
      );
    });
  });

  describe("addMessageForAccount", () => {
    it("404s when the ticket doesn't exist or isn't owned by this user", async () => {
      prismaMock.supportTicket.findFirst.mockResolvedValue(null);

      await expect(service.addMessageForAccount(CTX, "missing", { body: "b" })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects new messages on a closed ticket", async () => {
      prismaMock.supportTicket.findFirst.mockResolvedValue({ id: "t1", status: "closed" });

      await expect(service.addMessageForAccount(CTX, "t1", { body: "b" })).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.supportTicketMessage.create).not.toHaveBeenCalled();
    });

    it("creates the message and touches the ticket's updatedAt when open", async () => {
      prismaMock.supportTicket.findFirst.mockResolvedValueOnce({ id: "t1", status: "open" }).mockResolvedValueOnce({
        id: "t1", subject: "s", status: "open", relatedReportOrderId: null, relatedPropertyId: null, createdAt: new Date(), updatedAt: new Date(),
      });
      prismaMock.supportTicketMessage.findMany.mockResolvedValue([]);

      await service.addMessageForAccount(CTX, "t1", { body: "b" });

      expect(prismaMock.supportTicketMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ticketId: "t1", senderType: "user", body: "b" }) }),
      );
      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "t1" } }),
      );
    });
  });
});
