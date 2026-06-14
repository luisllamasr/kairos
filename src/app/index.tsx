import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kairos</Text>
      <Text style={styles.subtitle}>Experiences worth remembering.</Text>
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
  },
});
