import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kairos</Text>
      <Text style={styles.subtitle}>Experiences worth remembering.</Text>
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#111111',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#555555',
    textAlign: 'center',
    marginBottom: 48,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  signOutText: {
    fontSize: 15,
    color: '#555555',
  },
});
