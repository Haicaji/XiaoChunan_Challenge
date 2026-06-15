import { Bluetooth, KeyRound, UserRound } from "lucide-react";
import { FormEvent, type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import deniedFlagVoiceUrl from "../static/你不是真正的萧楚楠_不给你_FLAG.mp3?url";
import canNotEnterVoiceUrl from "../static/你进不来的.mp3?url";
import helloVoiceUrl from "../static/萧楚楠又见到你了.mp3?url";
import lockedVoiceUrl from "../static/这次我加了把锁.mp3?url";
import { login, unlock, type UnlockResult } from "./api";
import { unlockOverBle } from "./ble/client";

interface Session {
  username: string;
  password: string;
  authenticated: boolean;
  token: string | null;
}

type View = "login" | "control";
type RunState = "idle" | "running" | "success" | "failed" | "error";
type LoginStage = "aiPrompt" | "subtitle" | "form";
type SubtitleTone = "entering" | "visible" | "dimmed";
type VoiceId = "hello" | "locked" | "canNotEnter" | "deniedFlag";

const INTRO_SUBTITLES = [
  { text: "萧楚楠又见到你了", voiceId: "hello" },
  { text: "这次我加了把锁", voiceId: "locked" },
  { text: "你进不来的", voiceId: "canNotEnter" }
] satisfies Array<{ text: string; voiceId: VoiceId }>;

const VOICE_URLS: Record<VoiceId, string> = {
  hello: helloVoiceUrl,
  locked: lockedVoiceUrl,
  canNotEnter: canNotEnterVoiceUrl,
  deniedFlag: deniedFlagVoiceUrl
};

const VOICE_IDS = Object.keys(VOICE_URLS) as VoiceId[];

const VOICE_LABELS: Record<VoiceId, string> = {
  hello: "萧楚楠又见到你了",
  locked: "这次我加了把锁",
  canNotEnter: "你进不来的",
  deniedFlag: "你不是真正的萧楚楠, 不给你FLAG"
};

const INITIAL_VOICE_REFS: Record<VoiceId, HTMLAudioElement | null> = {
  hello: null,
  locked: null,
  canNotEnter: null,
  deniedFlag: null
};
const DENIED_FLAG_MESSAGE = "你不是真正的萧楚楠, 不给你FLAG";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getBleErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) {
    return "蓝牙连接失败，请确认设备已开机并靠近后重试。";
  }

  if (/user gesture|user activation/i.test(error.message)) {
    return "蓝牙请求没有拿到本次点击授权，请重新点击开锁。";
  }

  if (/user cancelled|cancelled|canceled/i.test(error.message)) {
    return "已取消蓝牙设备选择。";
  }

  return error.message;
}

export function App() {
  const [view, setView] = useState<View>("login");
  const [loginStage, setLoginStage] = useState<LoginStage>("aiPrompt");
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [subtitleTone, setSubtitleTone] = useState<SubtitleTone>("entering");
  const [formLeaving, setFormLeaving] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");
  const [bleStatusMessage, setBleStatusMessage] = useState("");
  const [unlockResult, setUnlockResult] = useState<UnlockResult | null>(null);
  const voiceRefs = useRef<Record<VoiceId, HTMLAudioElement | null>>({ ...INITIAL_VOICE_REFS });

  const canUnlock = Boolean(session) && runState !== "running";
  const flagText = unlockResult?.authorized && unlockResult.flag ? unlockResult.flag : DENIED_FLAG_MESSAGE;

  const playVoice = useCallback((voiceId: VoiceId) => {
    const voice = voiceRefs.current[voiceId];
    if (!voice) {
      return;
    }

    VOICE_IDS.forEach((id) => {
      const currentVoice = voiceRefs.current[id];
      if (currentVoice && currentVoice !== voice) {
        currentVoice.pause();
        currentVoice.currentTime = 0;
      }
    });

    voice.pause();
    voice.currentTime = 0;
    void voice.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      VOICE_IDS.forEach((id) => {
        voiceRefs.current[id]?.pause();
        voiceRefs.current[id] = null;
      });
    };
  }, []);

  useEffect(() => {
    if (view !== "login") {
      return;
    }

    setLoginStage("aiPrompt");
    setSubtitleIndex(0);
    setSubtitleTone("entering");
    setFormLeaving(false);

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const promptDelay = prefersReducedMotion ? 450 : 2400;
    const sentenceDuration = prefersReducedMotion ? 620 : 2200;
    const brightDuration = prefersReducedMotion ? 420 : 1450;
    const outroDelay = prefersReducedMotion ? 160 : 520;
    const timers: number[] = [];

    timers.push(window.setTimeout(() => setLoginStage("subtitle"), promptDelay));

    INTRO_SUBTITLES.forEach((_, index) => {
      const startAt = promptDelay + index * sentenceDuration;
      timers.push(window.setTimeout(() => {
        setSubtitleIndex(index);
        setSubtitleTone("entering");
      }, startAt));
      timers.push(window.setTimeout(() => {
        setSubtitleTone("visible");
      }, startAt + (prefersReducedMotion ? 80 : 520)));
      timers.push(window.setTimeout(() => {
        setSubtitleTone("dimmed");
      }, startAt + brightDuration));
    });

    timers.push(window.setTimeout(
      () => setLoginStage("form"),
      promptDelay + INTRO_SUBTITLES.length * sentenceDuration + outroDelay
    ));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [view]);

  useEffect(() => {
    if (view !== "login" || loginStage !== "subtitle" || subtitleTone !== "entering") {
      return;
    }

    playVoice(INTRO_SUBTITLES[subtitleIndex].voiceId);
  }, [loginStage, playVoice, subtitleIndex, subtitleTone, view]);

  useEffect(() => {
    if (view !== "control" || !unlockResult || unlockResult.authorized) {
      return;
    }

    playVoice("deniedFlag");
  }, [playVoice, unlockResult, view]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim();
    setLoginBusy(true);
    setLoginError("");
    setFormLeaving(false);

    let authenticated = false;
    let token: string | null = null;
    let immediateUnlockResult: UnlockResult | null = null;

    try {
      const result = await login(normalizedUsername, password);
      authenticated = result.authenticated;
      token = result.token;

      if (authenticated && token) {
        try {
          immediateUnlockResult = await unlock(token);
        } catch {
          immediateUnlockResult = null;
        }
      }

      if (!authenticated) {
        immediateUnlockResult = { authorized: false, flag: null };
      }
    } catch {
      authenticated = false;
      token = null;
      immediateUnlockResult = { authorized: false, flag: null };
    } finally {
      setLoginBusy(false);
    }

    setFormLeaving(true);
    await delay(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 80 : 650);

    setSession({
      username: normalizedUsername,
      password,
      authenticated,
      token
    });
    setUnlockResult(immediateUnlockResult);
    setBleStatusMessage("");
    setRunState("idle");
    setView("control");
  }

  async function handleUnlock() {
    if (!session) {
      return;
    }

    setRunState("running");
    setUnlockResult(null);
    setBleStatusMessage("正在请求蓝牙设备...");

    let nextRunState: RunState = "error";

    try {
      const bleResult = await unlockOverBle(session.username, session.password, () => undefined);
      nextRunState = bleResult.response.status === "success" ? "success" : "failed";
      setBleStatusMessage(
        bleResult.response.status === "success"
          ? "蓝牙开锁成功。"
          : "蓝牙设备已响应，但开锁校验失败。"
      );
    } catch (error) {
      setBleStatusMessage(getBleErrorMessage(error));
    }

    let apiResult: UnlockResult = { authorized: false, flag: null };
    try {
      apiResult = await unlock(session.token);
      setUnlockResult(apiResult);
    } catch {
      setUnlockResult(apiResult);
    }

    setRunState(nextRunState);
  }

  function resetLogin() {
    setView("login");
    setSession(null);
    setUnlockResult(null);
    setBleStatusMessage("");
    setRunState("idle");
    setFormLeaving(false);
  }

  if (view === "login") {
    return (
      <>
        <main className={`app-shell login-shell ${loginStage === "form" ? "form-ready" : "intro-ready"}`}>
          <section
            className={`login-panel ${loginStage === "form" ? "credential-panel" : "intro-panel"}`}
            aria-label={loginStage === "form" ? "账号密码登录" : undefined}
            aria-labelledby={loginStage === "form" ? undefined : "login-title"}
          >
            {loginStage === "aiPrompt" ? (
              <div className="ai-prompt-card" role="status" aria-live="polite">
                <h1 id="login-title" className="sr-only">注意AI内容识别</h1>
                <div className="subtitle-lines">
                  <span className="is-entering">注意AI内容识别</span>
                </div>
              </div>
            ) : null}

            {loginStage === "subtitle" ? (
              <div className="subtitle-card" role="status" aria-live="polite">
                <h1 id="login-title" className="sr-only">登录字幕</h1>
                <div className="subtitle-lines">
                  <span className={`is-${subtitleTone}`} key={INTRO_SUBTITLES[subtitleIndex].text}>
                    {INTRO_SUBTITLES[subtitleIndex].text}
                  </span>
                </div>
              </div>
            ) : null}

            {loginStage === "form" ? (
              <form
                className={`login-form credential-form${loginBusy ? " is-busy" : ""}${loginError ? " has-error" : ""}${formLeaving ? " is-leaving" : ""}`}
                onSubmit={handleLogin}
                aria-busy={loginBusy}
              >
                <label className="sr-only" htmlFor="username">账号</label>
                <div className="input-row credential-input">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    spellCheck={false}
                    placeholder="账号"
                    enterKeyHint="next"
                    aria-invalid={loginError ? true : undefined}
                    aria-describedby={loginError ? "login-error" : undefined}
                    autoFocus
                    required
                  />
                </div>

                <label className="sr-only" htmlFor="password">密码</label>
                <div className="input-row credential-input">
                  <KeyRound size={18} aria-hidden="true" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="密码"
                    enterKeyHint="go"
                    aria-invalid={loginError ? true : undefined}
                    aria-describedby={loginError ? "login-error" : undefined}
                    required
                  />
                </div>

                {loginError ? <p id="login-error" className="sr-only" role="alert">{loginError}</p> : null}

                <button className="sr-only-submit" type="submit" tabIndex={-1} disabled={loginBusy}>
                  {loginBusy ? "验证中" : "验证并进入"}
                </button>
              </form>
            ) : null}
          </section>
        </main>
        <VoiceBank voiceRefs={voiceRefs} />
      </>
    );
  }

  return (
    <>
      <main className="app-shell control-shell minimal-control-shell">
        <section className="unlock-only-panel" aria-label="开锁与 FLAG">
          <button className="unlock-button" type="button" onClick={handleUnlock} disabled={!canUnlock}>
            <Bluetooth size={22} aria-hidden="true" />
            {runState === "running" ? "执行中" : "开锁"}
          </button>

          {bleStatusMessage ? (
            <p className={`ble-status ${runState}`} role="status">
              {bleStatusMessage}
            </p>
          ) : null}

          <div className={unlockResult?.authorized ? "flag-box revealed" : "flag-box"}>
            <span>FLAG</span>
            <strong>{flagText}</strong>
          </div>
        </section>
      </main>
      <VoiceBank voiceRefs={voiceRefs} />
    </>
  );
}

function VoiceBank({ voiceRefs }: { voiceRefs: MutableRefObject<Record<VoiceId, HTMLAudioElement | null>> }) {
  return (
    <div className="voice-bank" aria-hidden="true">
      {VOICE_IDS.map((voiceId) => (
        <audio
          key={voiceId}
          ref={(element) => {
            voiceRefs.current[voiceId] = element;
          }}
          src={VOICE_URLS[voiceId]}
          preload="auto"
          title={VOICE_LABELS[voiceId]}
        />
      ))}
    </div>
  );
}
