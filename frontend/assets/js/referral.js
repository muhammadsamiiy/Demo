(function () {
  function isIdoaReferral(referral) {
    const referralType = String(referral?.referral?.referralType || "").toUpperCase();
    const clientType = String(referral?.referral?.clientType || "").toUpperCase();
    return referralType.includes("IDOA") || clientType.includes("IDOA");
  }

  window.ReferralService = {
    isIdoaReferral,
  };
})();
