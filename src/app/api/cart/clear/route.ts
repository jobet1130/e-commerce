import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  successResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/api/api-response";

// DELETE /api/cart/clear - Clear user's cart
export async function DELETE(request: NextRequest) {
  // eslint-disable-line @typescript-eslint/no-unused-vars
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return unauthorizedResponse("You must be logged in to clear your cart");
    }

    // Get user's cart
    const cart = await prisma.cart.findUnique({
      where: { userId: session.user.id },
      include: { items: true },
    });

    if (!cart) {
      return successResponse({
        data: { items: [], total: 0 },
        message: "Cart is already empty",
      });
    }

    // Delete all cart items
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    // Reset cart total
    const updatedCart = await prisma.cart.update({
      where: { id: cart.id },
      data: {
        total: 0,
      },
      include: { items: true },
    });

    return successResponse({
      data: updatedCart,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return serverErrorResponse("Failed to clear cart");
  }
}
