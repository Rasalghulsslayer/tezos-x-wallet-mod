/**
 * App — the mobile wallet shell. Mirrors the design's App in mobile/app.jsx,
 * minus the web-only phone frame + faux StatusBar (this runs on a real device,
 * so the OS chrome is real). It wraps everything in WalletProvider, then renders
 * the current screen off the vault state + navigation (tab index and a modal
 * stack), the bottom TabBar, and the transient overlays (account switcher,
 * dApp approval, toast).
 *
 * Navigation has no third-party navigator: the context (useWallet) holds the tab
 * + stack, and this shell renders whatever it points at, keyed so a screen
 * transition remounts.
 */

import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, safe, space } from './src/theme';
import { Icon } from './src/ui/icon';
import { ExperimentalBanner } from './src/ui/tx/ExperimentalBanner';
import { LogoMark } from './src/ui/tx/LogoMark';
import { TabBar, type TabId } from './src/ui/tx/TabBar';
import { WalletProvider, useWallet, type StackName, type WalletContextValue } from './src/wallet/context';
import { Home } from './src/screens/Home';
import { Activity } from './src/screens/Activity';
import { Connections } from './src/screens/Connections';
import { Settings } from './src/screens/Settings';
import { Send } from './src/screens/Send';
import { Receive } from './src/screens/Receive';
import { AddAccount } from './src/screens/AddAccount';
import { AddToken } from './src/screens/AddToken';
import { Tokens } from './src/screens/Tokens';
import { Welcome } from './src/screens/Welcome';
import { Create } from './src/screens/Create';
import { Import } from './src/screens/Import';
import { Unlock } from './src/screens/Unlock';
import { AccountSwitcher } from './src/screens/AccountSwitcher';
import { Approve } from './src/screens/Approve';

/**
 * Every screen reads the data it needs from useWallet(). Stack screens are
 * additionally handed their route params; screens that don't need them simply
 * declare no props and ignore the extra — so both kinds fit one component type.
 */
type Params = Record<string, unknown>;

const TAB_SCREENS: Record<TabId, React.ComponentType> = {
  home: Home,
  activity: Activity,
  connections: Connections,
  settings: Settings,
};

const STACK_SCREENS: Record<StackName, React.ComponentType<{ params: Params }>> = {
  send: Send,
  receive: Receive,
  addAccount: AddAccount,
  addToken: AddToken,
  tokens: Tokens,
  welcome: Welcome,
  create: Create,
  import: Import,
};

/** Resolves the current screen from vault state + navigation and renders it. */
function ScreenHost(): React.JSX.Element {
  const ctx = useWallet();
  const top = ctx.stack[ctx.stack.length - 1];

  if (ctx.vault === 'onboarding') {
    // Onboarding lives entirely in the stack; Welcome is the base when it's empty.
    if (top == null) return <Welcome />;
    const Comp = STACK_SCREENS[top.name];
    return <Comp params={top.params} />;
  }
  if (ctx.vault === 'locked') {
    return <Unlock />;
  }
  // unlocked: a pushed screen wins over the active tab.
  if (top != null) {
    const Comp = STACK_SCREENS[top.name];
    return <Comp params={top.params} />;
  }
  const TabComp = TAB_SCREENS[ctx.nav.tab];
  return <TabComp />;
}

function Toast({ msg }: { msg: string }): React.JSX.Element {
  return (
    <View style={styles.toastWrap} pointerEvents="none">
      <View style={styles.toast}>
        <Icon name="check" size={15} strokeWidth={2.2} color={colors.fgInverted} />
        <Text style={styles.toastText}>{msg}</Text>
      </View>
    </View>
  );
}

/** The shell proper — reads the wallet context and lays out screen + overlays. */
function Shell(): React.JSX.Element {
  const ctx: WalletContextValue = useWallet();
  const showTabs = ctx.vault === 'unlocked' && ctx.stack.length === 0;
  // Remounting on nav change replays the screen-enter animation each transition.
  const screenKey =
    ctx.vault + ctx.nav.tab + ctx.stack.map((s) => s.name).join('/') + ctx.navDir;

  // Boot splash until the network-free readState resolves the initial vault view.
  if (!ctx.booted) {
    return (
      <View style={[styles.root, styles.splash]}>
        <LogoMark size={56} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} onTouchStart={() => ctx.touch()}>
      <ExperimentalBanner />
      <View style={styles.screenHost} key={screenKey}>
        <ScreenHost />
      </View>
      {showTabs && <TabBar active={ctx.nav.tab} onSelect={(id) => ctx.nav.goTab(id)} />}

      <Modal
        visible={ctx.switcherOpen}
        transparent
        animationType="slide"
        onRequestClose={ctx.closeSwitcher}
      >
        <Pressable style={styles.scrim} onPress={ctx.closeSwitcher}>
          <Pressable style={styles.sheetStop}>
            <AccountSwitcher />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={ctx.approve != null}
        transparent
        animationType="slide"
        onRequestClose={() => ctx.closeApprove()}
      >
        <Pressable style={styles.scrim} onPress={() => ctx.closeApprove()}>
          <Pressable style={styles.sheetStop}>
            {ctx.approve != null && <Approve />}
          </Pressable>
        </Pressable>
      </Modal>

      {ctx.toastMsg != null && <Toast msg={ctx.toastMsg} />}
    </SafeAreaView>
  );
}

export default function App(): React.JSX.Element {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  splash: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenHost: {
    flex: 1,
    minHeight: 0,
  },
  // Bottom-anchored modal backdrop: tap outside the sheet to dismiss.
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  // Swallows presses so a tap on the sheet body doesn't fall through to the scrim.
  sheetStop: {
    width: '100%',
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: safe.bottom + 76,
    alignItems: 'center',
    zIndex: 200,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: colors.fg,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  toastText: {
    color: colors.fgInverted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
