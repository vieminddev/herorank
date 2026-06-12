"use client";

import React, { useState, useMemo } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";

export default function ProfitCalculatorPage() {
  const [itemPrice, setItemPrice] = useState("25.00");
  const [shippingCharged, setShippingCharged] = useState("5.99");
  const [materialCost, setMaterialCost] = useState("8.00");
  const [laborCost, setLaborCost] = useState("5.00");
  const [shippingCost, setShippingCost] = useState("4.50");
  const [packagingCost, setPackagingCost] = useState("1.00");
  const [etsyAds, setEtsyAds] = useState("0.00");

  const calculations = useMemo(() => {
    const price = parseFloat(itemPrice) || 0;
    const shipping = parseFloat(shippingCharged) || 0;
    const material = parseFloat(materialCost) || 0;
    const labor = parseFloat(laborCost) || 0;
    const shipCost = parseFloat(shippingCost) || 0;
    const packaging = parseFloat(packagingCost) || 0;
    const ads = parseFloat(etsyAds) || 0;

    const totalRevenue = price + shipping;
    const listingFee = 0.20;
    const transactionFee = totalRevenue * 0.065;
    const processingFee = totalRevenue * 0.03 + 0.25;
    const totalEtsyFees = listingFee + transactionFee + processingFee;
    const totalCosts = material + labor + shipCost + packaging + ads + totalEtsyFees;
    const profit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      totalRevenue: totalRevenue.toFixed(2),
      listingFee: listingFee.toFixed(2),
      transactionFee: transactionFee.toFixed(2),
      processingFee: processingFee.toFixed(2),
      totalEtsyFees: totalEtsyFees.toFixed(2),
      totalCosts: totalCosts.toFixed(2),
      profit: profit.toFixed(2),
      margin: margin.toFixed(1),
    };
  }, [itemPrice, shippingCharged, materialCost, laborCost, shippingCost, packagingCost, etsyAds]);

  const isProfit = parseFloat(calculations.profit) >= 0;

  return (
    <ToolPageLayout
      title="Profit Calculator"
      prefix="Etsy"
      description="Know your real profit on every sale. Plug in your costs and Etsy calculates the rest — fees, shipping, and your take-home."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="card p-6">
          <h3 className="text-base font-bold text-text-primary mb-5">Costs</h3>
          <div className="space-y-4">
            {[
              { label: "Item Price", value: itemPrice, setter: setItemPrice },
              { label: "Shipping Charged to Buyer", value: shippingCharged, setter: setShippingCharged },
              { label: "Material Cost", value: materialCost, setter: setMaterialCost },
              { label: "Labor Cost", value: laborCost, setter: setLaborCost },
              { label: "Shipping Cost", value: shippingCost, setter: setShippingCost },
              { label: "Packaging Cost", value: packagingCost, setter: setPackagingCost },
              { label: "Etsy Ads Spend", value: etsyAds, setter: setEtsyAds },
            ].map((field) => (
              <div key={field.label}>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">
                  {field.label}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                    className="w-full pl-7 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {/* Profit Display */}
          <div
            className="card p-6 text-center"
            style={{
              background: isProfit ? "var(--success-bg)" : "var(--danger-bg)",
              borderColor: isProfit ? "var(--success)" : "var(--danger)",
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
              Your Profit
            </div>
            <div
              className="text-4xl font-bold"
              style={{ color: isProfit ? "var(--success)" : "var(--danger)" }}
            >
              ${calculations.profit}
            </div>
            <div
              className="text-sm font-semibold mt-1"
              style={{ color: isProfit ? "var(--success)" : "var(--danger)" }}
            >
              {calculations.margin}% margin
            </div>
          </div>

          {/* Fee Breakdown */}
          <div className="card p-6">
            <h3 className="text-base font-bold text-text-primary mb-4">
              Breakdown
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Total Revenue</span>
                <span className="font-semibold text-success">+${calculations.totalRevenue}</span>
              </div>
              <hr className="border-border-light" />
              <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                Etsy Fees
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Listing Fee</span>
                <span className="text-danger">-${calculations.listingFee}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Transaction Fee (6.5%)</span>
                <span className="text-danger">-${calculations.transactionFee}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Processing Fee (3% + $0.25)</span>
                <span className="text-danger">-${calculations.processingFee}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-border-light pt-2">
                <span className="text-text-primary">Total Etsy Fees</span>
                <span className="text-danger">-${calculations.totalEtsyFees}</span>
              </div>
              <hr className="border-border-light" />
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-text-primary">Total Costs</span>
                <span className="text-danger">-${calculations.totalCosts}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-border pt-3">
                <span className="text-text-primary">Net Profit</span>
                <span style={{ color: isProfit ? "var(--success)" : "var(--danger)" }}>
                  ${calculations.profit}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
