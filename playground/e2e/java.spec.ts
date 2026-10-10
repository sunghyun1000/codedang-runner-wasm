import { test, expect } from '@playwright/test'

test('Java compiles with upstream TeaVM and supports interactive byte stdin and EOF', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.locator('.cm-content').fill(`
public class Main {
  public static void main(String[] args) throws Exception {
    System.out.print("INPUT_READY 한글🙂");
    int value;
    while ((value = System.in.read()) != -1) System.out.print((char) value);
    System.err.println("EOF_READY");
  }
}`)
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('INPUT_READY', { timeout: 120_000 })
  await expect(page.locator('#runner-container')).toContainText('한글🙂')
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.insertText('interactive input')
  await page.keyboard.press('Enter')
  await expect(page.locator('#runner-container')).toContainText('interactive input')
  await page.keyboard.press('Control+d')
  await expect(page.locator('#runner-container')).toContainText('EOF_READY')
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})

test('Java syntax errors are reported without execution', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.locator('.cm-content').fill('public class Main { public static void main(String[] args) { int x = ; } }')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('Main.java:1:')
  await expect(page.locator('#run')).toBeEnabled()
  await expect(page.locator('#runner-container')).not.toContainText('Process ended with exit code: 0')
})

test('Java BufferedReader accepts interactive UTF-8 lines and EOF', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.locator('.cm-content').fill(`import java.io.*;
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
    System.out.print("INPUT_READY");
    String line;
    while ((line = reader.readLine()) != null) System.out.println("ECHO:" + line);
    System.err.println("EOF_READY");
  }
}`)
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('INPUT_READY')
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.insertText('한글🙂 input')
  await page.keyboard.press('Enter')
  await expect(page.locator('#runner-container')).toContainText('ECHO:한글🙂 input')
  await page.keyboard.press('Control+d')
  await expect(page.locator('#runner-container')).toContainText('EOF_READY')
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})

test('Java can be stopped while blocked on stdin, then run again', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.locator('.cm-content').fill('public class Main { public static void main(String[] args) throws Exception { System.out.print("WAITING"); System.in.read(); } }')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('WAITING')
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('Control+c')
  await expect(page.locator('#run')).toBeEnabled()
  await page.locator('.cm-content').fill('public class Main { public static void main(String[] args) { System.out.println("SECOND_RUN"); } }')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('SECOND_RUN')
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})

test('Java algorithm libraries work with buffered interactive input', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.locator('.cm-content').fill(`import java.io.*;
import java.util.*;
import java.math.BigInteger;
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
    System.out.print("INPUT_READY");
    StringTokenizer tokens = new StringTokenizer(reader.readLine());
    PriorityQueue<Integer> heap = new PriorityQueue<>();
    while (tokens.hasMoreTokens()) heap.add(Integer.parseInt(tokens.nextToken()));
    int sum = 0;
    while (!heap.isEmpty()) sum += heap.poll();
    System.out.println("SUM=" + sum);
    System.out.println(new BigInteger("12345678901234567890").multiply(BigInteger.TEN));
  }
}`)
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('INPUT_READY')
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.insertText('7 5 -2')
  await page.keyboard.press('Enter')
  await expect(page.locator('#runner-container')).toContainText('SUM=10')
  await expect(page.locator('#runner-container')).toContainText('123456789012345678900')
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})
