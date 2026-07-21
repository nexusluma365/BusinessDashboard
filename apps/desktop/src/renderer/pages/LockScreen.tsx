import { useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { useSecurityStore } from "@/store/useSecurityStore";

export default function LockScreen() {
  const { keyAvailable, mode, error, authenticate } = useSecurityStore();
  const [pin, setPin] = useState("");

  if (!keyAvailable) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg-primary">
        <div className="panel p-10 max-w-sm text-center space-y-4">
          <ShieldAlert size={28} className="mx-auto text-status-warning" />
          <h1 className="text-lg font-semibold">Insert Security Key to Continue</h1>
          <p className="text-sm text-text-secondary">
            Nexus Luma requires an approved hardware security key. Connect your key to unlock the application.
          </p>
          {error && <p className="text-sm text-status-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-bg-primary">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          authenticate(pin);
        }}
        className="panel p-10 max-w-sm w-full space-y-5"
      >
        <div className="w-10 h-10 rounded-full bg-accent-goldMuted text-accent-gold flex items-center justify-center">
          <KeyRound size={18} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Enter your PIN</h1>
          <p className="text-sm text-text-secondary mt-1">
            Security key detected ({mode}). Enter your PIN to issue a session.
          </p>
        </div>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="w-full bg-bg-panel border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent-gold"
          autoFocus
        />
        {error && <p className="text-sm text-status-error">{error}</p>}
        <button
          type="submit"
          className="w-full bg-accent-gold text-bg-primary font-medium rounded-lg py-2 text-sm hover:brightness-110 transition"
        >
          Unlock
        </button>
        <p className="text-xs text-text-muted text-center">Demo PIN: 0000</p>
      </form>
    </div>
  );
}
