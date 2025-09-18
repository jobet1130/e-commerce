import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { OrderStatus, PaymentMethod, Role } from "@prisma/client";
import {
  successResponse,
  unauthorizedResponse,
  serverErrorResponse,
  badRequestResponse,
  forbiddenResponse,
} from "@/lib/api/api-response";

// Validation schemas
const checkoutSchema = z.object({
  shippingAddressId: z.string().min(1, "Shipping address is required"),
  billingAddressId: z.string().optional(),
  couponCode: z.string().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().optional(),
  saveBillingAddress: z.boolean().optional().default(false),
});

const updateStatusSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  status: z.nativeEnum(OrderStatus),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  notes: z.string().optional(),
});

// Checkout - Validate cart and create order
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to checkout");
    }

    // Validate request body
    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse(
        "Invalid request data",
        validation.error.format(),
      );
    }

    const {
      shippingAddressId,
      billingAddressId,
      couponCode,
      paymentMethod,
      notes,
      saveBillingAddress,
    } = validation.data;

    // Get user's cart with items
    const cart = await prisma.cart.findUnique({
      where: { userId: session.user.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                inventoryLogs: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return badRequestResponse("Your cart is empty");
    }

    // Validate cart items and check inventory
    const outOfStockItems = [];
    for (const item of cart.items) {
      // Calculate current stock by summing up all inventory logs
      const currentStock =
        item.product.inventoryLogs?.reduce((sum, log) => {
          // Add for STOCK_IN, subtract for other types (STOCK_OUT, ADJUSTMENT, etc.)
          return log.type === "STOCK_IN"
            ? sum + log.quantity
            : sum - log.quantity;
        }, 0) || 0;

      if (item.quantity > currentStock) {
        outOfStockItems.push({
          productId: item.productId,
          name: item.product.name,
          requested: item.quantity,
          available: currentStock,
        });
      }
    }

    if (outOfStockItems.length > 0) {
      return badRequestResponse("Some items are out of stock", {
        outOfStockItems,
      });
    }

    // Get or create billing address
    let finalBillingAddressId = billingAddressId || shippingAddressId;

    if (saveBillingAddress && !billingAddressId) {
      const shippingAddress = await prisma.address.findUnique({
        where: { id: shippingAddressId },
      });

      if (shippingAddress) {
        // Exclude the id since we're creating a new address
        const { id: _, ...addressData } = shippingAddress;
        const newBillingAddress = await prisma.address.create({
          data: {
            ...addressData,
            userId: session.user.id,
          },
        });
        finalBillingAddressId = newBillingAddress.id;
      }
    }

    // Calculate totals
    const subtotal = cart.items.reduce(
      (sum, item) =>
        sum + (item.priceAtTime || item.product.price) * item.quantity,
      0,
    );

    // Apply coupon if provided
    let discountAmount = 0;
    let coupon = null;

    if (couponCode) {
      coupon = await prisma.coupon.findFirst({
        where: {
          AND: [
            {
              code: couponCode,
              isActive: true,
            },
            {
              OR: [{ expiresAt: { gte: new Date() } }, { expiresAt: null }],
            },
            {
              OR: [{ minPurchase: { lte: subtotal } }, { minPurchase: null }],
            },
          ],
        },
      });

      if (coupon) {
        if (coupon.minPurchase && subtotal < coupon.minPurchase) {
          return badRequestResponse(
            `Minimum purchase amount of ₱${coupon.minPurchase} required for this coupon`,
          );
        }

        discountAmount =
          coupon.discountType === "PERCENTAGE"
            ? (subtotal * coupon.discountValue) / 100
            : Math.min(coupon.discountValue, subtotal);
      }
    }

    const total = subtotal - discountAmount;
    const shippingFee = 0; // Implement shipping calculation logic
    const tax = 0; // Implement tax calculation logic
    const grandTotal = total + shippingFee + tax;

    // Create order in a transaction
    const order = await prisma.$transaction(async (prisma) => {
      // Create order
      const newOrder = await prisma.order.create({
        data: {
          userId: session.user.id,
          status: OrderStatus.PENDING,
          paymentMethod: paymentMethod,
          subtotal,
          discount: discountAmount,
          tax,
          shippingFee,
          total: grandTotal,
          shippingAddressId,
          billingAddressId: finalBillingAddressId,
          notes,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.product.price,
            })),
          },
          payment: {
            create: {
              amount: grandTotal,
              method: paymentMethod,
              status: "PENDING",
              reference: `PAY-${Date.now()}`,
            },
          },
        },
        include: {
          items: true,
          payment: true,
          shippingAddress: true,
          billingAddress: true,
        },
      });

      // Update inventory
      for (const item of cart.items) {
        // First find the inventory log for this product
        const inventoryLog = await prisma.inventoryLog.findFirst({
          where: { productId: item.productId },
        });

        if (inventoryLog) {
          // Then update using the found id
          await prisma.inventoryLog.update({
            where: { id: inventoryLog.id },
            data: {
              quantity: { decrement: item.quantity },
              updatedAt: new Date(),
            },
          });
        }
      }

      // Clear cart
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return newOrder;
    });

    // TODO: Process payment (integrate with payment gateway)
    // This is where you would integrate with Stripe, PayPal, etc.
    // For now, we'll just return the created order

    return successResponse({
      data: { order },
      message: "Order created successfully",
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return serverErrorResponse("Failed to process checkout");
  }
}

// Get order history for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to view orders");
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status") as OrderStatus | null;

    const skip = (page - 1) * limit;

    // Build where clause with proper type inference
    const where = {
      userId: session.user.id,
      ...(status && { status }),
    };

    // Get orders with pagination
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            select: {
              id: true,
              quantity: true,
              price: true,
              product: {
                select: {
                  name: true,
                  images: true,
                },
              },
            },
            take: 3, // Only get first 3 items for preview
          },
          _count: {
            select: { items: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.order.count({ where }),
    ]);

    return successResponse({
      message: "Orders retrieved successfully",
      orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return serverErrorResponse("Failed to fetch orders");
  }
}

// Update order status (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorizedResponse("You must be logged in to update orders");
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== Role.ADMIN && user?.role !== Role.STAFF) {
      return forbiddenResponse("You don't have permission to update orders");
    }

    // Validate request body
    const body = await request.json();
    const validation = updateStatusSchema.safeParse(body);

    if (!validation.success) {
      return badRequestResponse(
        "Invalid request data",
        validation.error.format(),
      );
    }

    const { orderId, status, trackingNumber, carrier, notes } = validation.data;

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        trackingNumber,
        carrier,
        ...(notes && { adminNotes: notes }),
        ...(status === OrderStatus.SHIPPED && { shippedAt: new Date() }),
        ...(status === OrderStatus.DELIVERED && { deliveredAt: new Date() }),
        ...(status === OrderStatus.CANCELLED && { cancelledAt: new Date() }),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // TODO: Send email notification to user about order status update
    // This would integrate with your email service

    return successResponse({
      order: updatedOrder,
      message: "Order status updated successfully",
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return serverErrorResponse("Failed to update order status");
  }
}
